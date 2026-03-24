import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface MarketplaceEntry {
  id: string;
  repo: string;
  description: string;
  tags: string[];
  certified: boolean;
}

interface MarketplaceState {
  installed: string[];
  certified: string[];
  updatedAt: string;
}

export interface MarketplaceOptions {
  env?: NodeJS.ProcessEnv;
  statePath?: string;
}

const DEFAULT_CATALOG: MarketplaceEntry[] = [
  {
    id: 'research',
    repo: 'lifeos-community/research-module',
    description: 'Research assistant with local context and follow-up memory.',
    tags: ['research', 'knowledge'],
    certified: true,
  },
  {
    id: 'weather',
    repo: 'lifeos-community/weather-module',
    description: 'Offline-first weather snapshots and spoken forecasts.',
    tags: ['weather', 'daily'],
    certified: true,
  },
  {
    id: 'news',
    repo: 'lifeos-community/news-module',
    description: 'RSS-powered daily digest with local summarization fallback.',
    tags: ['news', 'digest'],
    certified: true,
  },
  {
    id: 'smart-home',
    repo: 'lifeos-community/smart-home-module',
    description: 'Bridge LifeOS intents to Home Assistant and MQTT devices.',
    tags: ['automation', 'home'],
    certified: false,
  },
];

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CATALOG_REPO_SET = new Set(DEFAULT_CATALOG.map((entry) => entry.repo.toLowerCase()));

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
  const state = await readMarketplaceState(options);
  const installedSet = new Set(state.installed);
  return DEFAULT_CATALOG.map((entry) => ({
    ...entry,
    installed: installedSet.has(entry.repo.toLowerCase()),
  }));
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
  const moduleId = normalizeRepoId(normalizedRepo);
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

  const state = await readMarketplaceState(options);
  const isKnownCatalogRepo = CATALOG_REPO_SET.has(normalizedRepo);
  const isInstalled = state.installed.includes(normalizedRepo);
  if (!isKnownCatalogRepo && !isInstalled) {
    throw new Error(
      `Repository "${normalizedRepo}" is not installed. Run "lifeos module install ${normalizedRepo}" first.`,
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
