import { access, constants, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

import { resolveLifeGraphPath } from './path';
import type { LifeGraphStorageInspection } from './types';

type BetterSqliteModule = {
  default?: new (path: string, options?: Record<string, unknown>) => {
    prepare(sql: string): {
      get(...params: unknown[]): unknown;
    };
    close(): void;
  };
};

function toDbPath(graphPath: string): string {
  if (graphPath.toLowerCase().endsWith('.json')) {
    return `${graphPath.slice(0, -5)}.db`;
  }
  return `${graphPath}.db`;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isBetterSqliteUnavailableError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
    return true;
  }

  const lower = message.toLowerCase();
  if (!lower.includes('better-sqlite3')) {
    return false;
  }

  return (
    lower.includes('could not locate the bindings file') ||
    lower.includes('cannot find module') ||
    lower.includes('dlopen') ||
    lower.includes('invalid elf header') ||
    lower.includes('shared object file') ||
    lower.includes('was compiled against a different node.js version') ||
    lower.includes('is not a valid win32 application')
  );
}

function deriveBackendCandidate(
  sqliteExists: boolean,
  sqliteOpenable: boolean,
  sqliteProbeUnavailable: boolean,
  jsonExists: boolean,
  jsonReadable: boolean,
  jsonParseable: boolean,
): LifeGraphStorageInspection['backendCandidate'] {
  if (sqliteExists && (sqliteOpenable || sqliteProbeUnavailable)) {
    return 'sqlite';
  }

  if (sqliteExists && !sqliteOpenable && !sqliteProbeUnavailable) {
    return 'sqlite';
  }

  if (!sqliteExists && jsonExists && jsonReadable && jsonParseable) {
    return 'json-file';
  }

  if (!sqliteExists && (!jsonExists || !jsonReadable || !jsonParseable)) {
    return 'missing';
  }

  return 'unknown';
}

function hasJsonVersionField(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') {
    return false;
  }

  const value = parsed as {
    version?: unknown;
    meta?: unknown;
  };

  if (typeof value.version === 'string' && value.version.trim().length > 0) {
    return true;
  }

  if (Array.isArray(value.meta)) {
    for (const entry of value.meta) {
      if (
        entry &&
        typeof entry === 'object' &&
        'key' in entry &&
        'value' in entry &&
        (entry as { key?: unknown }).key === 'version' &&
        typeof (entry as { value?: unknown }).value === 'string' &&
        String((entry as { value?: unknown }).value).trim().length > 0
      ) {
        return true;
      }
    }
  }

  return false;
}

export async function inspectLifeGraphStorage(
  graphPath?: string,
  _overrideImport?: () => Promise<unknown>,
): Promise<LifeGraphStorageInspection> {
  const resolvedGraphPath = resolveLifeGraphPath(graphPath);
  const dbPath = toDbPath(resolvedGraphPath);
  const jsonAdapterPath = `${dbPath}.json`;

  const warnings: string[] = [];
  const errors: string[] = [];

  let sqliteExists = false;
  let sqliteOpenable = false;
  let sqliteProbeUnavailable = false;
  let sqliteSchemaInitialized = false;
  let sqliteVersionPresent = false;
  let migrationBackupPath: string | null = null;

  let jsonExists = false;
  let jsonReadable = false;
  let jsonParseable = false;
  let jsonVersionPresent = false;

  try {
    const sqliteStats = await stat(dbPath);
    sqliteExists = sqliteStats.isFile();
  } catch {
    sqliteExists = false;
  }

  let jsonProbePath = resolvedGraphPath;
  try {
    const jsonStats = await stat(resolvedGraphPath);
    jsonExists = jsonStats.isFile();
  } catch {
    jsonExists = false;
  }

  if (!jsonExists) {
    try {
      const jsonAdapterStats = await stat(jsonAdapterPath);
      if (jsonAdapterStats.isFile()) {
        jsonExists = true;
        jsonProbePath = jsonAdapterPath;
      }
    } catch {
      jsonExists = false;
    }
  }

  if (sqliteExists) {
    try {
      const importBetterSqlite3 = _overrideImport ?? (() => import('better-sqlite3'));
      const imported = (await importBetterSqlite3()) as BetterSqliteModule;
      const Database = imported.default;

      if (typeof Database !== 'function') {
        throw new Error('better-sqlite3 loaded without a default Database export');
      }

      const db = new Database(dbPath, { readonly: true });
      sqliteOpenable = true;

      try {
        const versionRow = db
          .prepare('SELECT value FROM meta WHERE key = ?')
          .get('version') as { value?: string } | undefined;
        sqliteSchemaInitialized = true;
        sqliteVersionPresent = typeof versionRow?.value === 'string' && versionRow.value.length > 0;

        const migrationRow = db
          .prepare('SELECT value FROM meta WHERE key = ?')
          .get('migrationBackupPath') as { value?: string } | undefined;
        migrationBackupPath =
          typeof migrationRow?.value === 'string' && migrationRow.value.length > 0
            ? migrationRow.value
            : null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        if (message.toLowerCase().includes('no such table')) {
          sqliteSchemaInitialized = false;
        } else {
          sqliteOpenable = false;
          errors.push(`Failed to probe SQLite metadata at ${dbPath}: ${message}`);
        }
      } finally {
        try {
          db.close();
        } catch {
          // Ignore close errors for a read-only probe.
        }
      }
    } catch (error) {
      if (isBetterSqliteUnavailableError(error)) {
        sqliteProbeUnavailable = true;
        sqliteOpenable = false;
        warnings.push(
          `SQLite probe unavailable for ${dbPath}: ${error instanceof Error ? error.message : String(error ?? 'unknown error')}`,
        );
      } else {
        sqliteOpenable = false;
        errors.push(
          `Failed to open SQLite database at ${dbPath}: ${error instanceof Error ? error.message : String(error ?? 'unknown error')}`,
        );
      }
    }
  }

  if (jsonExists) {
    try {
      await access(jsonProbePath, constants.R_OK);
      jsonReadable = true;
    } catch {
      jsonReadable = false;
    }

    if (jsonReadable) {
      try {
        const raw = await readFile(jsonProbePath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        jsonParseable = true;
        jsonVersionPresent = hasJsonVersionField(parsed);
      } catch (error) {
        jsonParseable = false;
        errors.push(
          `Failed to parse JSON graph at ${jsonProbePath}: ${error instanceof Error ? error.message : String(error ?? 'unknown error')}`,
        );
      }
    }
  }

  const backendCandidate = deriveBackendCandidate(
    sqliteExists,
    sqliteOpenable,
    sqliteProbeUnavailable,
    jsonExists,
    jsonReadable,
    jsonParseable,
  );

  if (!(await fileExists(dirname(dbPath)))) {
    warnings.push(`Storage directory does not exist yet: ${dirname(dbPath)}`);
  }

  return {
    backendCandidate,
    graphPath: resolvedGraphPath,
    dbPath,
    sqliteExists,
    sqliteOpenable,
    sqliteProbeUnavailable,
    sqliteSchemaInitialized,
    sqliteVersionPresent,
    jsonExists,
    jsonReadable,
    jsonParseable,
    jsonVersionPresent,
    migrationBackupPath,
    warnings,
    errors,
  };
}