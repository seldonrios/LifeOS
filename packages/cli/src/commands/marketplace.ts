import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateModuleManifest } from './module-create';

export interface MarketplaceEntry {
  id: string;
  repo: string;
  description: string;
  tags: string[];
  certified: boolean;
  category: string;
  subFeatures: string[];
}

interface MarketplaceState {
  installed: string[];
  certified: string[];
  updatedAt: string;
}

export interface MarketplaceOptions {
  env?: NodeJS.ProcessEnv;
  statePath?: string;
  baseDir?: string;
  catalogPath?: string;
  certifiedOnly?: boolean;
  registryUrl?: string;
}

export interface MarketplaceRefreshResult {
  source: string;
  catalogPath: string;
  count: number;
}

const DEFAULT_CATALOG: MarketplaceEntry[] = [
  {
    id: 'research',
    repo: 'lifeos-community/research-module',
    description: 'Research assistant with local context and follow-up memory.',
    tags: ['research', 'knowledge'],
    certified: true,
    category: 'knowledge',
    subFeatures: [],
  },
  {
    id: 'weather',
    repo: 'lifeos-community/weather-module',
    description: 'Offline-first weather snapshots and spoken forecasts.',
    tags: ['weather', 'daily'],
    certified: true,
    category: 'utilities',
    subFeatures: [],
  },
  {
    id: 'news',
    repo: 'lifeos-community/news-module',
    description: 'RSS-powered daily digest with local summarization fallback.',
    tags: ['news', 'digest'],
    certified: true,
    category: 'information',
    subFeatures: [],
  },
  {
    id: 'google-bridge',
    repo: 'seldonrios/google-bridge-module',
    description: 'Unified Google bridge (Calendar, Tasks, Gmail and workspace sync).',
    tags: ['google', 'bridge', 'calendar', 'tasks', 'gmail'],
    certified: true,
    category: 'bridge',
    subFeatures: ['calendar', 'tasks', 'gmail', 'drive', 'contacts', 'keep'],
  },
  {
    id: 'smart-home',
    repo: 'lifeos-community/smart-home-module',
    description: 'Bridge LifeOS intents to Home Assistant and MQTT devices.',
    tags: ['automation', 'home'],
    certified: false,
    category: 'automation',
    subFeatures: [],
  },
];

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MODULE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

interface CommunityModulesFileEntry {
  name?: unknown;
  repo?: unknown;
  certified?: unknown;
  category?: unknown;
  description?: unknown;
  tags?: unknown;
  subFeatures?: unknown;
}

interface CommunityModulesFile {
  modules?: unknown;
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || process.cwd();
}

function normalizeRepo(repo: string): string {
  return repo
    .trim()
    .replace(/\.git$/i, '')
    .toLowerCase();
}

function resolveBaseDir(options: MarketplaceOptions = {}): string {
  return options.baseDir ?? process.cwd();
}

function normalizeRepoId(repo: string): string {
  const raw = repo.split('/')[1] ?? repo;
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.git$/i, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-module$/, '')
    .replace(/^-+|-+$/g, '');
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
        .filter((entry) => entry.length > 0),
    ),
  ];
}

function normalizeSubFeatures(value: unknown): string[] {
  return normalizeList(value).filter((entry) => MODULE_ID_PATTERN.test(entry));
}

function normalizeCategory(value: unknown): string {
  if (typeof value !== 'string') {
    return 'community';
  }
  const normalized = value.trim().toLowerCase();
  return normalized && MODULE_ID_PATTERN.test(normalized) ? normalized : 'community';
}

function normalizeDescription(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeCatalogEntry(entry: CommunityModulesFileEntry): MarketplaceEntry | null {
  const name = typeof entry.name === 'string' ? entry.name.trim().toLowerCase() : '';
  const repo = typeof entry.repo === 'string' ? entry.repo.trim().toLowerCase() : '';
  if (!MODULE_ID_PATTERN.test(name) || !REPO_PATTERN.test(repo)) {
    return null;
  }

  return {
    id: name,
    repo,
    description: normalizeDescription(entry.description, `${name} community module`),
    tags: normalizeList(entry.tags),
    certified: entry.certified === true,
    category: normalizeCategory(entry.category),
    subFeatures: normalizeSubFeatures(entry.subFeatures),
  };
}

function resolveCatalogPath(options: MarketplaceOptions = {}): string {
  if (options.catalogPath) {
    return options.catalogPath;
  }
  const baseDir = resolveBaseDir(options);
  return join(baseDir, 'community-modules.json');
}

function resolveRegistryCachePath(options: MarketplaceOptions = {}): string {
  const env = options.env ?? process.env;
  return join(resolveHomeDir(env), '.lifeos', 'community-modules.cache.json');
}

function resolveRegistrySource(options: MarketplaceOptions = {}): string | null {
  if (options.registryUrl?.trim()) {
    return options.registryUrl.trim();
  }
  const env = options.env ?? process.env;
  const fromEnv = env.LIFEOS_MARKETPLACE_REGISTRY_URL?.trim();
  return fromEnv || null;
}

function parseCatalogDocument(raw: unknown): MarketplaceEntry[] {
  const document =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CommunityModulesFile) : {};
  const modules = Array.isArray(document.modules) ? document.modules : [];
  return modules
    .map((entry) =>
      normalizeCatalogEntry(
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? (entry as CommunityModulesFileEntry)
          : {},
      ),
    )
    .filter((entry): entry is MarketplaceEntry => entry !== null);
}

async function readCatalogFile(path: string): Promise<MarketplaceEntry[]> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return parseCatalogDocument(raw);
  } catch {
    return [];
  }
}

async function writeCatalogFile(path: string, entries: MarketplaceEntry[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const payload = {
    modules: entries.map((entry) => ({
      name: entry.id,
      repo: entry.repo,
      certified: entry.certified,
      category: entry.category,
      description: entry.description,
      tags: entry.tags,
      ...(entry.subFeatures.length > 0 ? { subFeatures: entry.subFeatures } : {}),
    })),
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readCatalogFromSource(source: string): Promise<MarketplaceEntry[]> {
  const normalized = source.trim();
  if (!normalized) {
    return [];
  }

  if (normalized.startsWith('file://')) {
    const path = fileURLToPath(normalized);
    return readCatalogFile(path);
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    const response = await fetch(normalized, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(
        `registry request failed (${response.status}). Ensure the source URL returns community-modules.json.`,
      );
    }
    const raw = (await response.json()) as unknown;
    return parseCatalogDocument(raw);
  }

  return readCatalogFile(normalized);
}

async function readCatalog(options: MarketplaceOptions = {}): Promise<MarketplaceEntry[]> {
  const catalogPath = resolveCatalogPath(options);
  const local = await readCatalogFile(catalogPath);
  if (local.length > 0) {
    return local;
  }

  const source = resolveRegistrySource(options);
  if (source) {
    try {
      const remote = await readCatalogFromSource(source);
      if (remote.length > 0) {
        await writeCatalogFile(catalogPath, remote);
        await writeCatalogFile(resolveRegistryCachePath(options), remote);
        return remote;
      }
    } catch {
      const cached = await readCatalogFile(resolveRegistryCachePath(options));
      if (cached.length > 0) {
        return cached;
      }
    }
  }

  const cached = await readCatalogFile(resolveRegistryCachePath(options));
  if (cached.length > 0) {
    return cached;
  }
  return DEFAULT_CATALOG;
}

function defaultState(now = new Date()): MarketplaceState {
  return {
    installed: [],
    certified: [],
    updatedAt: now.toISOString(),
  };
}

function resolveMarketplaceStatePath(options: MarketplaceOptions = {}): string {
  if (options.statePath) {
    return options.statePath;
  }
  const env = options.env ?? process.env;
  return join(resolveHomeDir(env), '.lifeos', 'marketplace.json');
}

async function readMarketplaceState(options: MarketplaceOptions = {}): Promise<MarketplaceState> {
  const path = resolveMarketplaceStatePath(options);
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    return {
      installed: normalizeList(raw.installed),
      certified: normalizeList(raw.certified),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
}

async function writeMarketplaceState(
  state: MarketplaceState,
  options: MarketplaceOptions = {},
): Promise<MarketplaceState> {
  const path = resolveMarketplaceStatePath(options);
  const normalized: MarketplaceState = {
    installed: normalizeList(state.installed),
    certified: normalizeList(state.certified),
    updatedAt: new Date().toISOString(),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function listMarketplaceEntries(
  options: MarketplaceOptions = {},
): Promise<Array<MarketplaceEntry & { installed: boolean }>> {
  const catalog = await readCatalog(options);
  const state = await readMarketplaceState(options);
  const installedSet = new Set(state.installed);
  const entries = catalog.map((entry) => ({
    ...entry,
    installed: installedSet.has(entry.repo.toLowerCase()),
  }));
  if (options.certifiedOnly) {
    return entries.filter((entry) => entry.certified);
  }
  return entries;
}

export async function refreshMarketplaceRegistry(
  sourceOrUrl: string | undefined,
  options: MarketplaceOptions = {},
): Promise<MarketplaceRefreshResult> {
  const source = sourceOrUrl?.trim() || resolveRegistrySource(options);
  if (!source) {
    throw new Error(
      'Marketplace source URL is required. Provide one via `lifeos marketplace refresh <url>` or LIFEOS_MARKETPLACE_REGISTRY_URL.',
    );
  }

  const entries = await readCatalogFromSource(source);
  if (entries.length === 0) {
    throw new Error('Marketplace source returned zero valid modules.');
  }

  const catalogPath = resolveCatalogPath(options);
  await writeCatalogFile(catalogPath, entries);
  await writeCatalogFile(resolveRegistryCachePath(options), entries);
  return {
    source,
    catalogPath,
    count: entries.length,
  };
}

export async function searchMarketplaceEntries(
  term: string,
  options: MarketplaceOptions = {},
): Promise<Array<MarketplaceEntry & { installed: boolean }>> {
  const normalizedTerm = term.trim().toLowerCase();
  const entries = await listMarketplaceEntries(options);
  if (!normalizedTerm) {
    return entries;
  }
  return entries.filter((entry) => {
    return (
      entry.id.includes(normalizedTerm) ||
      entry.repo.includes(normalizedTerm) ||
      entry.description.toLowerCase().includes(normalizedTerm) ||
      entry.tags.some((tag) => tag.includes(normalizedTerm))
    );
  });
}

export async function installMarketplaceModule(
  repo: string,
  options: MarketplaceOptions = {},
): Promise<{ repo: string; moduleId: string }> {
  const normalizedRepo = normalizeRepo(repo);
  if (!REPO_PATTERN.test(normalizedRepo)) {
    throw new Error('Repository must be in the form "<owner>/<repo>".');
  }
  const catalog = await readCatalog(options);
  const catalogMatch = catalog.find((entry) => entry.repo.toLowerCase() === normalizedRepo);
  const moduleId = catalogMatch?.id ?? normalizeRepoId(normalizedRepo);
  if (!moduleId) {
    throw new Error('Repository name could not be converted to a valid module id.');
  }

  const state = await readMarketplaceState(options);
  const nextInstalled = new Set(state.installed);
  nextInstalled.add(normalizedRepo);
  await writeMarketplaceState(
    {
      ...state,
      installed: [...nextInstalled],
    },
    options,
  );

  return {
    repo: normalizedRepo,
    moduleId,
  };
}

export async function certifyMarketplaceModule(
  repo: string,
  options: MarketplaceOptions = {},
): Promise<{ repo: string }> {
  const normalizedRepo = normalizeRepo(repo);
  if (!REPO_PATTERN.test(normalizedRepo)) {
    throw new Error('Repository must be in the form "<owner>/<repo>".');
  }

  const catalog = await readCatalog(options);
  const catalogRepoSet = new Set(catalog.map((entry) => entry.repo.toLowerCase()));
  const state = await readMarketplaceState(options);
  const isKnownCatalogRepo = catalogRepoSet.has(normalizedRepo);
  const isInstalled = state.installed.includes(normalizedRepo);
  if (!isKnownCatalogRepo && !isInstalled) {
    throw new Error(
      `Repository "${normalizedRepo}" is not installed. Run "lifeos module install ${normalizedRepo}" first.`,
    );
  }

  const moduleId = normalizeRepoId(normalizedRepo);
  const baseDir = resolveBaseDir(options);
  const moduleManifestPath = join(baseDir, 'modules', moduleId, 'lifeos.json');
  const moduleSourcePath = join(baseDir, 'modules', moduleId, 'src', 'index.ts');
  const moduleTestPath = join(baseDir, 'modules', moduleId, 'src', 'index.test.ts');
  const badgePath = join(baseDir, 'docs', 'badges', 'works-with-lifeos.svg');
  try {
    await access(moduleManifestPath);
    await access(moduleSourcePath);
    await access(moduleTestPath);
    await access(badgePath);
  } catch {
    throw new Error(
      `Automated certification checks require local module sources at modules/${moduleId} with src/index.ts, src/index.test.ts, and docs/badges/works-with-lifeos.svg.`,
    );
  }

  const validation = await validateModuleManifest(moduleId, baseDir);
  if (!validation.valid) {
    throw new Error(
      `Certification checks failed for "${moduleId}": ${validation.errors.join('; ')}`,
    );
  }

  const nextCertified = new Set(state.certified);
  nextCertified.add(normalizedRepo);
  await writeMarketplaceState(
    {
      ...state,
      certified: [...nextCertified],
    },
    options,
  );

  return {
    repo: normalizedRepo,
  };
}
