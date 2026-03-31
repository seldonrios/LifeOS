import type { DisplayConfig, DisplayMode, SurfaceKind } from '../types';

const DEFAULT_HOME_NODE_URL = 'http://localhost:3010';
const DEFAULT_POLL_MS = 30_000;
const DEFAULT_SURFACE_KIND: SurfaceKind = 'kitchen_display';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function normalizeSurfaceKind(value: string | undefined): SurfaceKind {
  const candidate = (value ?? '').trim() as SurfaceKind;
  const allowed = new Set<SurfaceKind>([
    'kitchen_display',
    'hallway_display',
    'living_room_display',
    'desk_display',
    'voice_endpoint',
    'mobile_app',
  ]);

  return allowed.has(candidate) ? candidate : DEFAULT_SURFACE_KIND;
}

export function resolveDisplayMode(pathname: string, surfaceKind?: SurfaceKind): DisplayMode {
  if (surfaceKind === 'hallway_display') {
    return 'hallway';
  }

  if (surfaceKind === 'kitchen_display') {
    return 'kitchen';
  }

  return pathname.toLowerCase().includes('hallway') ? 'hallway' : 'kitchen';
}

export function readDisplayConfig(): DisplayConfig {
  const env = import.meta.env;
  const pollRaw = Number.parseInt(env.VITE_DISPLAY_POLL_MS ?? '', 10);
  const surfaceKind = normalizeSurfaceKind(env.VITE_SURFACE_KIND);

  return {
    homeNodeUrl: normalizeBaseUrl(env.VITE_HOME_NODE_URL ?? DEFAULT_HOME_NODE_URL),
    surfaceId: (env.VITE_SURFACE_ID ?? '').trim(),
    surfaceKind,
    householdId: (env.VITE_HOUSEHOLD_ID ?? '').trim(),
    surfaceToken: (env.VITE_SURFACE_TOKEN ?? '').trim(),
    pollMs: Number.isFinite(pollRaw) && pollRaw > 999 ? pollRaw : DEFAULT_POLL_MS,
    mode: resolveDisplayMode(window.location.pathname, surfaceKind),
  };
}
