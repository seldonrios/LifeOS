import { createHmac, timingSafeEqual } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
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
  resourceHint: 'low' | 'medium' | 'high';
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

export type MarketplaceTrustMode = 'strict' | 'warn' | 'off';

export interface MarketplaceCatalogSourceStatus {
  source: string;
  catalogPath: string;
  kind: 'local' | 'cache' | 'remote' | 'default';
  lastUpdated: string | null;
  staleAfterDays: number;
  isStale: boolean;
  trusted: boolean;
  verified: boolean;
  verificationMode: MarketplaceTrustMode;
  verificationError?: string;
  count: number;
  priority: number;
}

export interface MarketplaceCatalogStatus {
  source: string;
  catalogPath: string;
  lastUpdated: string | null;
  staleAfterDays: number;
  isStale: boolean;
  trustMode: MarketplaceTrustMode;
  trustedSourceCount: number;
  totalSourceCount: number;
  sources: MarketplaceCatalogSourceStatus[];
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
    resourceHint: 'high',
  },
  {
    id: 'weather',
    repo: 'lifeos-community/weather-module',
    description: 'Offline-first weather snapshots and spoken forecasts.',
    tags: ['weather', 'daily'],
    certified: true,
    category: 'utilities',
    subFeatures: [],
    resourceHint: 'low',
  },
  {
    id: 'news',
    repo: 'lifeos-community/news-module',
    description: 'RSS-powered daily digest with local summarization fallback.',
    tags: ['news', 'digest'],
    certified: true,
    category: 'information',
    subFeatures: [],
    resourceHint: 'medium',
  },
  {
    id: 'google-bridge',
    repo: 'seldonrios/google-bridge-module',
    description: 'Unified Google bridge (Calendar, Tasks, Gmail and workspace sync).',
    tags: ['google', 'bridge', 'calendar', 'tasks', 'gmail'],
    certified: true,
    category: 'bridge',
    subFeatures: ['calendar', 'tasks', 'gmail', 'drive', 'contacts', 'keep'],
    resourceHint: 'medium',
  },
  {
    id: 'smart-home',
    repo: 'lifeos-community/smart-home-module',
    description: 'Bridge LifeOS intents to Home Assistant and MQTT devices.',
    tags: ['automation', 'home'],
    certified: false,
    category: 'automation',
    subFeatures: [],
    resourceHint: 'medium',
  },
];

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MODULE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const DEFAULT_CATALOG_STALE_DAYS = 14;

interface CommunityModulesFileEntry {
  name?: unknown;
  repo?: unknown;
  certified?: unknown;
  category?: unknown;
  description?: unknown;
  tags?: unknown;
  subFeatures?: unknown;
  resourceHint?: unknown;
}

interface CatalogSignatureBlock {
  keyId?: unknown;
  algorithm?: unknown;
  value?: unknown;
}

interface CommunityModulesFile {
  lastUpdated?: unknown;
  modules?: unknown;
  signature?: unknown;
}

interface ParsedCatalogEnvelope {
  entries: MarketplaceEntry[];
  lastUpdated: string | null;
  signature: { keyId: string; algorithm: string; value: string } | null;
}

interface CatalogSourceDescriptor {
  source: string;
  kind: 'local' | 'cache' | 'remote';
  catalogPath: string;
  priority: number;
}

interface CatalogReadResult {
  source: CatalogSourceDescriptor;
  entries: MarketplaceEntry[];
  lastUpdated: string | null;
  isStale: boolean;
  trusted: boolean;
  verified: boolean;
  verificationError?: string;
}

interface MergeCandidate {
  entry: MarketplaceEntry;
  verified: boolean;
  sourcePriority: number;
  lastUpdatedMs: number;
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

function normalizeResourceHint(value: unknown): 'low' | 'medium' | 'high' {
  if (typeof value !== 'string') {
    return 'medium';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return 'medium';
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
    resourceHint: normalizeResourceHint(entry.resourceHint),
  };
}

function parseCatalogDocument(raw: unknown): ParsedCatalogEnvelope {
  const document =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CommunityModulesFile) : {};
  const modules = Array.isArray(document.modules) ? document.modules : [];
  const parsed = modules
    .map((entry) =>
      normalizeCatalogEntry(
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? (entry as CommunityModulesFileEntry)
          : {},
      ),
    )
    .filter((entry): entry is MarketplaceEntry => entry !== null);

  const unique = new Map<string, MarketplaceEntry>();
  for (const entry of parsed) {
    if (!unique.has(entry.id)) {
      unique.set(entry.id, entry);
    }
  }

  const signatureRaw =
    document.signature &&
    typeof document.signature === 'object' &&
    !Array.isArray(document.signature)
      ? (document.signature as CatalogSignatureBlock)
      : null;
  const keyId =
    signatureRaw && typeof signatureRaw.keyId === 'string' ? signatureRaw.keyId.trim() : '';
  const value =
    signatureRaw && typeof signatureRaw.value === 'string' ? signatureRaw.value.trim() : '';
  const algorithm =
    signatureRaw && typeof signatureRaw.algorithm === 'string'
      ? signatureRaw.algorithm.trim().toLowerCase()
      : 'hmac-sha256';

  return {
    entries: Array.from(unique.values()),
    lastUpdated: extractLastUpdated(raw),
    signature: keyId && value ? { keyId, value, algorithm } : null,
  };
}

function resolveBaseDir(options: MarketplaceOptions = {}): string {
  return options.baseDir ?? process.cwd();
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

function resolveStaleAfterDays(options: MarketplaceOptions = {}): number {
  const env = options.env ?? process.env;
  const parsed = Number.parseInt(env.LIFEOS_MARKETPLACE_STALE_DAYS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CATALOG_STALE_DAYS;
  }
  return parsed;
}

function isCatalogStale(lastUpdated: string | null, staleAfterDays: number): boolean {
  if (!lastUpdated) {
    return false;
  }
  const parsed = Date.parse(`${lastUpdated}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  const ageDays = Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000));
  return ageDays > staleAfterDays;
}

function extractLastUpdated(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const candidate = typeof record.lastUpdated === 'string' ? record.lastUpdated.trim() : '';
  if (!candidate) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return null;
  }
  return candidate;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => key !== 'signature')
    .sort((left, right) => left.localeCompare(right));
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function parseTrustMode(env: NodeJS.ProcessEnv): MarketplaceTrustMode {
  const configured = (env.LIFEOS_MARKETPLACE_TRUST_MODE ?? '').trim().toLowerCase();
  if (configured === 'strict' || configured === 'warn' || configured === 'off') {
    return configured;
  }
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production' ? 'strict' : 'warn';
}

function parseTrustKeys(env: NodeJS.ProcessEnv): Map<string, string> {
  const configured = (env.LIFEOS_MARKETPLACE_TRUST_KEYS ?? '').trim();
  if (!configured) {
    return new Map<string, string>();
  }

  if (configured.startsWith('{')) {
    try {
      const parsed = JSON.parse(configured) as Record<string, unknown>;
      const keys = new Map<string, string>();
      for (const [keyId, value] of Object.entries(parsed)) {
        if (typeof value !== 'string') {
          continue;
        }
        const normalizedKey = keyId.trim();
        const normalizedValue = value.trim();
        if (normalizedKey && normalizedValue) {
          keys.set(normalizedKey, normalizedValue);
        }
      }
      return keys;
    } catch {
      return new Map<string, string>();
    }
  }

  const keyMap = new Map<string, string>();
  for (const pair of configured.split(',')) {
    const [rawKey, rawValue] = pair.split(':', 2);
    const keyId = rawKey?.trim() ?? '';
    const secret = rawValue?.trim() ?? '';
    if (keyId && secret) {
      keyMap.set(keyId, secret);
    }
  }
  return keyMap;
}

function normalizeSignatureValue(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyCatalogSignature(
  rawDocument: unknown,
  signature: { keyId: string; algorithm: string; value: string } | null,
  trustKeys: Map<string, string>,
): { verified: boolean; reason?: string } {
  if (!signature) {
    return {
      verified: false,
      reason: 'missing_signature',
    };
  }
  if (signature.algorithm !== 'hmac-sha256') {
    return {
      verified: false,
      reason: `unsupported_algorithm:${signature.algorithm}`,
    };
  }
  const key = trustKeys.get(signature.keyId);
  if (!key) {
    return {
      verified: false,
      reason: `missing_trust_key:${signature.keyId}`,
    };
  }

  const canonicalPayload = stableStringify(rawDocument);
  const digest = createHmac('sha256', key).update(canonicalPayload).digest();
  const expectedBase64Url = digest
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const expectedBase64 = digest.toString('base64');
  const expectedHex = digest.toString('hex');
  const provided = normalizeSignatureValue(signature.value);

  if (
    safeEqualText(provided, expectedBase64Url) ||
    safeEqualText(provided, expectedBase64) ||
    safeEqualText(provided.toLowerCase(), expectedHex)
  ) {
    return { verified: true };
  }

  return {
    verified: false,
    reason: 'signature_mismatch',
  };
}

function toSourcePath(source: string, options: MarketplaceOptions): string {
  const trimmed = source.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('file://')) {
    return fileURLToPath(trimmed);
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (isAbsolute(trimmed)) {
    return trimmed;
  }
  return join(resolveBaseDir(options), trimmed);
}

function parseConfiguredSources(options: MarketplaceOptions = {}): string[] {
  const env = options.env ?? process.env;
  const configured = (env.LIFEOS_MARKETPLACE_SOURCES ?? '').trim();
  if (!configured) {
    return [];
  }
  return configured
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function resolveRegistrySource(options: MarketplaceOptions = {}): string | null {
  if (options.registryUrl?.trim()) {
    return options.registryUrl.trim();
  }
  const env = options.env ?? process.env;
  const fromEnv = env.LIFEOS_MARKETPLACE_REGISTRY_URL?.trim();
  return fromEnv || null;
}

function dedupeSources(sources: CatalogSourceDescriptor[]): CatalogSourceDescriptor[] {
  const seen = new Set<string>();
  const deduped: CatalogSourceDescriptor[] = [];
  for (const source of sources) {
    const key = source.source.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(source);
  }
  return deduped;
}

function resolveCatalogSources(
  options: MarketplaceOptions,
  includeStorageDefaults: boolean,
): CatalogSourceDescriptor[] {
  const sources: CatalogSourceDescriptor[] = [];
  const localCatalog = resolveCatalogPath(options);
  const cachePath = resolveRegistryCachePath(options);
  let priority = 0;

  if (includeStorageDefaults) {
    sources.push({
      source: localCatalog,
      kind: 'local',
      catalogPath: localCatalog,
      priority: priority++,
    });
  }

  for (const configured of parseConfiguredSources(options)) {
    const resolved = toSourcePath(configured, options);
    if (!resolved) {
      continue;
    }
    const remote = resolved.startsWith('http://') || resolved.startsWith('https://');
    sources.push({
      source: resolved,
      kind: remote ? 'remote' : 'local',
      catalogPath: resolved,
      priority: priority++,
    });
  }

  const legacySource = resolveRegistrySource(options);
  if (legacySource) {
    const resolved = toSourcePath(legacySource, options);
    if (resolved) {
      const remote = resolved.startsWith('http://') || resolved.startsWith('https://');
      sources.push({
        source: resolved,
        kind: remote ? 'remote' : 'local',
        catalogPath: resolved,
        priority: priority++,
      });
    }
  }

  if (includeStorageDefaults) {
    sources.push({
      source: cachePath,
      kind: 'cache',
      catalogPath: cachePath,
      priority: priority++,
    });
  }

  return dedupeSources(sources);
}

async function readCatalogFromSourceDescriptor(
  descriptor: CatalogSourceDescriptor,
  options: MarketplaceOptions,
  trustMode: MarketplaceTrustMode,
  trustKeys: Map<string, string>,
): Promise<CatalogReadResult> {
  const staleAfterDays = resolveStaleAfterDays(options);

  try {
    let rawDocument: unknown;
    if (descriptor.source.startsWith('http://') || descriptor.source.startsWith('https://')) {
      const response = await fetch(descriptor.source, {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`registry request failed (${response.status})`);
      }
      rawDocument = (await response.json()) as unknown;
    } else {
      rawDocument = JSON.parse(await readFile(descriptor.source, 'utf8')) as unknown;
    }

    const envelope = parseCatalogDocument(rawDocument);
    let trusted = true;
    let verified = descriptor.kind !== 'remote';
    let verificationError: string | undefined;

    if (descriptor.kind === 'remote' && trustMode !== 'off') {
      const verification = verifyCatalogSignature(rawDocument, envelope.signature, trustKeys);
      verified = verification.verified;
      trusted = verification.verified;
      verificationError = verification.reason;
    }

    if (descriptor.kind === 'remote' && trustMode === 'off') {
      trusted = true;
      verified = false;
    }

    const acceptedEntries =
      descriptor.kind === 'remote' && trustMode === 'strict' && !trusted ? [] : envelope.entries;

    return {
      source: descriptor,
      entries: acceptedEntries,
      lastUpdated: envelope.lastUpdated,
      isStale: isCatalogStale(envelope.lastUpdated, staleAfterDays),
      trusted,
      verified,
      ...(verificationError ? { verificationError } : {}),
    };
  } catch (error: unknown) {
    return {
      source: descriptor,
      entries: [],
      lastUpdated: null,
      isStale: false,
      trusted: descriptor.kind !== 'remote' || trustMode !== 'strict',
      verified: false,
      verificationError: error instanceof Error ? error.message : String(error),
    };
  }
}

function shouldReplaceCandidate(current: MergeCandidate, candidate: MergeCandidate): boolean {
  if (current.verified !== candidate.verified) {
    return candidate.verified;
  }
  if (current.lastUpdatedMs !== candidate.lastUpdatedMs) {
    return candidate.lastUpdatedMs > current.lastUpdatedMs;
  }
  if (current.sourcePriority !== candidate.sourcePriority) {
    return candidate.sourcePriority < current.sourcePriority;
  }
  return candidate.entry.repo.localeCompare(current.entry.repo) < 0;
}

function parseLastUpdatedMs(lastUpdated: string | null): number {
  if (!lastUpdated) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(`${lastUpdated}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return Number.NEGATIVE_INFINITY;
  }
  return parsed;
}

function mergeCatalogEntries(results: CatalogReadResult[]): MarketplaceEntry[] {
  const merged = new Map<string, MergeCandidate>();

  for (const result of results) {
    for (const entry of result.entries) {
      const candidate: MergeCandidate = {
        entry,
        verified: result.trusted,
        sourcePriority: result.source.priority,
        lastUpdatedMs: parseLastUpdatedMs(result.lastUpdated),
      };
      const existing = merged.get(entry.id);
      if (!existing || shouldReplaceCandidate(existing, candidate)) {
        merged.set(entry.id, candidate);
      }
    }
  }

  return Array.from(merged.values())
    .map((candidate) => candidate.entry)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function toSourceStatus(
  results: CatalogReadResult[],
  options: MarketplaceOptions,
  trustMode: MarketplaceTrustMode,
): MarketplaceCatalogSourceStatus[] {
  const staleAfterDays = resolveStaleAfterDays(options);
  return results.map((result) => ({
    source: result.source.source,
    catalogPath: result.source.catalogPath,
    kind: result.source.kind,
    lastUpdated: result.lastUpdated,
    staleAfterDays,
    isStale: result.isStale,
    trusted: result.trusted,
    verified: result.verified,
    verificationMode: trustMode,
    ...(result.verificationError ? { verificationError: result.verificationError } : {}),
    count: result.entries.length,
    priority: result.source.priority,
  }));
}

async function loadMergedCatalog(options: MarketplaceOptions = {}): Promise<{
  entries: MarketplaceEntry[];
  sourceStatuses: MarketplaceCatalogSourceStatus[];
  trustMode: MarketplaceTrustMode;
}> {
  const env = options.env ?? process.env;
  const trustMode = parseTrustMode(env);
  const trustKeys = parseTrustKeys(env);
  const descriptors = resolveCatalogSources(options, true);

  const results = await Promise.all(
    descriptors.map((source) =>
      readCatalogFromSourceDescriptor(source, options, trustMode, trustKeys),
    ),
  );

  let entries = mergeCatalogEntries(results);
  let sourceStatuses = toSourceStatus(results, options, trustMode);

  if (entries.length === 0) {
    entries = DEFAULT_CATALOG;
    sourceStatuses = [
      ...sourceStatuses,
      {
        source: 'default',
        catalogPath: resolveCatalogPath(options),
        kind: 'default',
        lastUpdated: null,
        staleAfterDays: resolveStaleAfterDays(options),
        isStale: false,
        trusted: true,
        verified: true,
        verificationMode: trustMode,
        count: DEFAULT_CATALOG.length,
        priority: 999,
      },
    ];
  }

  return {
    entries,
    sourceStatuses,
    trustMode,
  };
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

async function writeCatalogFile(path: string, entries: MarketplaceEntry[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const payload = {
    lastUpdated: new Date().toISOString().slice(0, 10),
    modules: entries.map((entry) => ({
      name: entry.id,
      repo: entry.repo,
      certified: entry.certified,
      category: entry.category,
      description: entry.description,
      tags: entry.tags,
      resourceHint: entry.resourceHint,
      ...(entry.subFeatures.length > 0 ? { subFeatures: entry.subFeatures } : {}),
    })),
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function listMarketplaceEntries(
  options: MarketplaceOptions = {},
): Promise<Array<MarketplaceEntry & { installed: boolean }>> {
  const catalog = await loadMergedCatalog(options);
  const state = await readMarketplaceState(options);
  const installedSet = new Set(state.installed);
  const entries = catalog.entries.map((entry) => ({
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
  const env = options.env ?? process.env;
  const trustMode = parseTrustMode(env);
  const trustKeys = parseTrustKeys(env);

  const explicitSources = sourceOrUrl?.trim().length
    ? sourceOrUrl
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

  const descriptors =
    explicitSources.length > 0
      ? explicitSources.map((entry, index) => {
          const resolved = toSourcePath(entry, options);
          const remote = resolved.startsWith('http://') || resolved.startsWith('https://');
          return {
            source: resolved,
            kind: remote ? ('remote' as const) : ('local' as const),
            catalogPath: resolved,
            priority: index,
          };
        })
      : resolveCatalogSources(options, false).filter((source) => source.kind === 'remote');

  if (descriptors.length === 0) {
    throw new Error(
      'Marketplace source URL is required. Provide one via `lifeos marketplace refresh <url>` or LIFEOS_MARKETPLACE_SOURCES/LIFEOS_MARKETPLACE_REGISTRY_URL.',
    );
  }

  const results = await Promise.all(
    descriptors.map((source) =>
      readCatalogFromSourceDescriptor(source, options, trustMode, trustKeys),
    ),
  );
  const merged = mergeCatalogEntries(results);
  if (merged.length === 0) {
    throw new Error('Marketplace source returned zero valid modules.');
  }

  const catalogPath = resolveCatalogPath(options);
  await writeCatalogFile(catalogPath, merged);
  await writeCatalogFile(resolveRegistryCachePath(options), merged);
  return {
    source: descriptors.map((descriptor) => descriptor.source).join(','),
    catalogPath,
    count: merged.length,
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

export async function getMarketplaceCatalogStatus(
  options: MarketplaceOptions = {},
): Promise<MarketplaceCatalogStatus> {
  const loaded = await loadMergedCatalog(options);
  const statuses = loaded.sourceStatuses;
  const primary =
    statuses
      .filter((status) => status.count > 0)
      .sort((left, right) => left.priority - right.priority)[0] ?? statuses[0];

  const trustedSourceCount = statuses.filter((status) => status.trusted).length;

  return {
    source: primary?.source ?? 'default',
    catalogPath: resolveCatalogPath(options),
    lastUpdated: primary?.lastUpdated ?? null,
    staleAfterDays: primary?.staleAfterDays ?? resolveStaleAfterDays(options),
    isStale: primary?.isStale ?? false,
    trustMode: loaded.trustMode,
    trustedSourceCount,
    totalSourceCount: statuses.length,
    sources: statuses,
  };
}

export async function installMarketplaceModule(
  repo: string,
  options: MarketplaceOptions = {},
): Promise<{ repo: string; moduleId: string }> {
  const normalizedRepo = normalizeRepo(repo);
  if (!REPO_PATTERN.test(normalizedRepo)) {
    throw new Error('Repository must be in the form "<owner>/<repo>".');
  }
  const catalog = (await loadMergedCatalog(options)).entries;
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

  const catalog = (await loadMergedCatalog(options)).entries;
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
