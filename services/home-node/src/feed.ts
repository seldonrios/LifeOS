import {
  HomeNodeDisplayFeedSchema,
  type HomeNodeDisplayFeed,
  type HomeNodeHome,
  type HomeNodeSurfaceRegistered,
  type HomeStateSnapshot,
  type SurfaceTrustLevel,
} from '@lifeos/contracts';
import { createSecurityClient } from '@lifeos/security';

export const DISPLAY_FEED_CACHE_TTL_MS = 30_000;

export interface DashboardDisplayFeedData {
  todayEvents?: HomeNodeDisplayFeed['todayEvents'];
  choresDueToday?: HomeNodeDisplayFeed['choresDueToday'];
  shoppingItems?: HomeNodeDisplayFeed['shoppingItems'];
  topReminders?: HomeNodeDisplayFeed['topReminders'];
  householdNotices?: HomeNodeDisplayFeed['householdNotices'];
}

export interface BuildDisplayFeedInput {
  snapshot: HomeStateSnapshot;
  dashboardData?: DashboardDisplayFeedData;
  stale: boolean;
  generatedAt?: string;
}

export interface DisplayFeedAggregatorInput {
  surface: HomeNodeSurfaceRegistered;
  home: HomeNodeHome;
  snapshot: HomeStateSnapshot;
}

export interface DisplayFeedAggregatorResult {
  feed: HomeNodeDisplayFeed;
  fromCache: boolean;
}

export interface DashboardFetchOptions {
  authToken?: string;
}

export type DashboardFetcher = (
  url: string,
  options?: DashboardFetchOptions,
) => Promise<DashboardDisplayFeedData>;

export interface DisplayFeedAggregatorOptions {
  dashboardBaseUrl?: string;
  dashboardServiceTokenProvider?: () => Promise<string | undefined>;
}

interface CachedFeedEntry {
  expiresAtMs: number;
  feed: HomeNodeDisplayFeed;
}

export function applyContentFilter(
  feed: HomeNodeDisplayFeed,
  trustLevel: SurfaceTrustLevel,
): HomeNodeDisplayFeed {
  if (trustLevel === 'personal') {
    return HomeNodeDisplayFeedSchema.parse(feed);
  }

  const withoutSensitiveReminders = feed.topReminders.filter((reminder) => !reminder.sensitive);

  if (trustLevel === 'guest') {
    return HomeNodeDisplayFeedSchema.parse({
      ...feed,
      todayEvents: [],
      choresDueToday: [],
      topReminders: [],
      householdNotices: feed.householdNotices.filter((notice) => notice.severity !== 'warning'),
      shoppingItems: feed.shoppingItems,
    });
  }

  return HomeNodeDisplayFeedSchema.parse({
    ...feed,
    topReminders: withoutSensitiveReminders,
  });
}

function resolveEffectiveTrustLevel(
  surfaceTrustLevel: SurfaceTrustLevel,
  homeMode: HomeStateSnapshot['home_mode'],
): SurfaceTrustLevel {
  if (homeMode === 'guest_mode') {
    return 'guest';
  }

  return surfaceTrustLevel;
}

function buildNotices(snapshot: HomeStateSnapshot): HomeNodeDisplayFeed['householdNotices'] {
  const notices: HomeNodeDisplayFeed['householdNotices'] = [];

  if (snapshot.home_mode === 'quiet_hours') {
    notices.push({
      id: 'quiet-hours',
      title: 'Quiet hours active',
      message: 'Display is in reduced ambient mode.',
      severity: 'info',
    });
  }

  if (snapshot.home_mode === 'guest_mode') {
    notices.push({
      id: 'guest-mode',
      title: 'Guest mode active',
      message: 'Sensitive household content is hidden.',
      severity: 'warning',
    });
  }

  if (snapshot.adapter_health !== 'healthy') {
    notices.push({
      id: 'adapter-health',
      title: 'Home adapter degraded',
      message: `Adapter status is ${snapshot.adapter_health}.`,
      severity: 'warning',
    });
  }

  return notices;
}

export function buildDisplayFeed(input: BuildDisplayFeedInput): HomeNodeDisplayFeed {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const dashboardData = input.dashboardData ?? {};

  return HomeNodeDisplayFeedSchema.parse({
    todayEvents: dashboardData.todayEvents ?? [],
    choresDueToday: dashboardData.choresDueToday ?? [],
    shoppingItems: dashboardData.shoppingItems ?? [],
    topReminders: dashboardData.topReminders ?? [],
    householdNotices:
      (dashboardData.householdNotices?.length ?? 0) > 0
        ? dashboardData.householdNotices
        : buildNotices(input.snapshot),
    stale: input.stale,
    generatedAt,
  });
}

async function fetchDashboardDataWithAuth(
  url: string,
  options: DashboardFetchOptions = {},
): Promise<DashboardDisplayFeedData> {
  const requestInit: RequestInit = {
    signal: AbortSignal.timeout(2_000),
  };
  if (options.authToken) {
    requestInit.headers = { Authorization: `Bearer ${options.authToken}` };
  }

  const response = await fetch(url, requestInit);
  if (!response.ok) {
    throw new Error(`dashboard display feed request failed: ${response.status}`);
  }

  const payload = (await response.json()) as DashboardDisplayFeedData;
  return payload;
}

function createDashboardServiceTokenProvider(): () => Promise<string | undefined> {
  const securityClient = createSecurityClient();
  let cachedToken: { token: string; expiresAtMs: number } | null = null;

  return async () => {
    const nowMs = Date.now();
    if (cachedToken && cachedToken.expiresAtMs > nowMs + 5_000) {
      return cachedToken.token;
    }

    const issued = await securityClient.issueServiceToken('home-node');
    const expiresAtMs = new Date(issued.expiresAt).getTime();
    cachedToken = {
      token: issued.token,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : nowMs + 60_000,
    };

    return cachedToken.token;
  };
}

function normalizeDashboardBaseUrl(raw: string | undefined): string {
  const normalized = (raw ?? '').trim();
  if (!normalized) {
    return 'http://localhost:3000';
  }

  return normalized.replace(/\/+$/, '');
}

export class DisplayFeedAggregator {
  private readonly cache = new Map<string, CachedFeedEntry>();
  private readonly dashboardBaseUrl: string;
  private readonly dashboardServiceTokenProvider: () => Promise<string | undefined>;

  constructor(
    private readonly dashboardFetcher: DashboardFetcher = fetchDashboardDataWithAuth,
    private readonly now: () => number = () => Date.now(),
    options: DisplayFeedAggregatorOptions = {},
  ) {
    this.dashboardBaseUrl = normalizeDashboardBaseUrl(
      options.dashboardBaseUrl ?? process.env.LIFEOS_DASHBOARD_BASE_URL,
    );
    this.dashboardServiceTokenProvider =
      options.dashboardServiceTokenProvider ?? createDashboardServiceTokenProvider();
  }

  private getFromCache(surfaceId: string): CachedFeedEntry | undefined {
    return this.cache.get(surfaceId);
  }

  async getDisplayFeed(input: DisplayFeedAggregatorInput): Promise<DisplayFeedAggregatorResult> {
    const effectiveTrustLevel = resolveEffectiveTrustLevel(
      input.surface.trust_level,
      input.snapshot.home_mode,
    );
    const cached = this.getFromCache(input.surface.surface_id);
    const nowMs = this.now();

    if (cached && cached.expiresAtMs > nowMs) {
      const freshFromCache = HomeNodeDisplayFeedSchema.parse({
        ...cached.feed,
        stale: false,
        generatedAt: new Date(nowMs).toISOString(),
      });
      return { feed: applyContentFilter(freshFromCache, effectiveTrustLevel), fromCache: true };
    }

    try {
      const dashboardServiceToken = await this.dashboardServiceTokenProvider();
      const fetchOptions = dashboardServiceToken
        ? { authToken: dashboardServiceToken }
        : undefined;
      const dashboardData = await this.dashboardFetcher(
        `${this.dashboardBaseUrl}/api/households/${input.surface.household_id}/display-feed`,
        fetchOptions,
      );
      const feed = buildDisplayFeed({
        snapshot: input.snapshot,
        dashboardData,
        stale: false,
        generatedAt: new Date(nowMs).toISOString(),
      });
      this.cache.set(input.surface.surface_id, {
        feed,
        expiresAtMs: nowMs + DISPLAY_FEED_CACHE_TTL_MS,
      });

      return {
        feed: applyContentFilter(feed, effectiveTrustLevel),
        fromCache: false,
      };
    } catch {
      if (cached) {
        const staleCached = HomeNodeDisplayFeedSchema.parse({
          ...cached.feed,
          stale: true,
          generatedAt: new Date(nowMs).toISOString(),
        });
        return {
          feed: applyContentFilter(staleCached, effectiveTrustLevel),
          fromCache: true,
        };
      }

      const staleSnapshotOnly = buildDisplayFeed({
        snapshot: input.snapshot,
        dashboardData: {
          householdNotices: buildNotices(input.snapshot),
        },
        stale: true,
        generatedAt: new Date(nowMs).toISOString(),
      });

      return {
        feed: applyContentFilter(staleSnapshotOnly, effectiveTrustLevel),
        fromCache: false,
      };
    }
  }
}
