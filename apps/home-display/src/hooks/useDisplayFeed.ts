import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { HomeNodeDisplayFeedSchema, type HomeNodeDisplayFeed } from '@lifeos/contracts';

import type { DisplayConfig } from '../types';

const HEARTBEAT_MS = 60_000;
const HINT_TIMEOUT_MS = 30_000;
const QUERY_KEY_PREFIX = 'display-feed';

const lifecycleStorageKey = (config: DisplayConfig) =>
  `lifeos.home-display.surface-id:${config.householdId}:${config.surfaceKind}`;

function deriveDashboardUrl(homeNodeUrl: string): string {
  const parsed = new URL(homeNodeUrl);
  if (parsed.port === '3010') {
    parsed.port = '3000';
  }

  return parsed.toString().replace(/\/$/, '');
}

function createHeaders(config: DisplayConfig): HeadersInit {
  return {
    'x-lifeos-surface-secret': config.surfaceToken,
  };
}

async function upsertHomeAndZone(config: DisplayConfig): Promise<{ homeId: string; zoneId: string }> {
  const homeId = `home-${config.householdId || 'default'}`;
  const zoneSuffix = config.surfaceKind.includes('hallway') ? 'hallway' : 'kitchen';
  const zoneId = `zone-${zoneSuffix}-${config.householdId || 'default'}`;

  await fetch(`${config.homeNodeUrl}/api/home-node/homes`, {
    method: 'POST',
    headers: {
      ...createHeaders(config),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      home_id: homeId,
      household_id: config.householdId || 'household-default',
      name: 'Home Display',
      timezone: 'UTC',
    }),
  });

  await fetch(`${config.homeNodeUrl}/api/home-node/zones`, {
    method: 'POST',
    headers: {
      ...createHeaders(config),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      zone_id: zoneId,
      home_id: homeId,
      name: config.surfaceKind.includes('hallway') ? 'Hallway' : 'Kitchen',
      type: config.surfaceKind.includes('hallway') ? 'hallway' : 'kitchen',
    }),
  });

  return { homeId, zoneId };
}

async function registerSurface(config: DisplayConfig, currentSurfaceId?: string): Promise<string> {
  const { homeId, zoneId } = await upsertHomeAndZone(config);

  const response = await fetch(`${config.homeNodeUrl}/api/home-node/surfaces/register`, {
    method: 'POST',
    headers: {
      ...createHeaders(config),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      surface_id: currentSurfaceId,
      zone_id: zoneId,
      home_id: homeId,
      kind: config.surfaceKind,
      trust_level: 'household',
      capabilities: ['read', 'quick-action'],
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`surface registration failed (${response.status})`);
  }

  const payload = (await response.json()) as { surface_id: string };
  return payload.surface_id;
}

async function sendHeartbeat(config: DisplayConfig, surfaceId: string): Promise<void> {
  const response = await fetch(
    `${config.homeNodeUrl}/api/home-node/surfaces/${encodeURIComponent(surfaceId)}/heartbeat`,
    {
      method: 'POST',
      headers: {
        ...createHeaders(config),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ seen_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(4_000),
    },
  );

  if (!response.ok) {
    throw new Error(`heartbeat failed (${response.status})`);
  }
}

async function fetchDisplayFeed(config: DisplayConfig, surfaceId: string): Promise<HomeNodeDisplayFeed> {
  const response = await fetch(
    `${config.homeNodeUrl}/api/home-node/display-feed/${encodeURIComponent(surfaceId)}`,
    {
      headers: createHeaders(config),
      signal: AbortSignal.timeout(4_000),
    },
  );

  if (!response.ok) {
    throw new Error(`display feed request failed (${response.status})`);
  }

  const payload = await response.json();
  return HomeNodeDisplayFeedSchema.parse(payload);
}

async function fetchDisplayHintVersion(
  config: DisplayConfig,
  surfaceId: string,
  since: number,
): Promise<number> {
  const response = await fetch(
    `${config.homeNodeUrl}/api/home-node/display-feed-hints/${encodeURIComponent(surfaceId)}?householdId=${encodeURIComponent(config.householdId)}&since=${since}&timeoutMs=${HINT_TIMEOUT_MS}`,
    {
      headers: createHeaders(config),
      signal: AbortSignal.timeout(HINT_TIMEOUT_MS + 2_000),
    },
  );

  if (!response.ok) {
    throw new Error(`display hint request failed (${response.status})`);
  }

  const payload = (await response.json()) as { signalVersion?: number };
  return typeof payload.signalVersion === 'number' ? payload.signalVersion : since;
}

export function useDisplayFeed(config: DisplayConfig) {
  const queryClient = useQueryClient();
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);
  const [hintVersion, setHintVersion] = useState(0);
  const [resolvedSurfaceId, setResolvedSurfaceId] = useState<string>(() => {
    const fromStorage = localStorage.getItem(lifecycleStorageKey(config)) ?? '';
    return config.surfaceId || fromStorage;
  });

  const queryKey = useMemo(
    () => [QUERY_KEY_PREFIX, config.homeNodeUrl, resolvedSurfaceId],
    [config.homeNodeUrl, resolvedSurfaceId],
  );

  const enabled =
    config.surfaceToken.length > 0 &&
    config.householdId.length > 0 &&
    config.homeNodeUrl.length > 0 &&
    resolvedSurfaceId.length > 0;

  useEffect(() => {
    let disposed = false;
    let retryMs = 2_000;

    const bootstrap = async () => {
      while (!disposed) {
        try {
          const registeredId = await registerSurface(config, resolvedSurfaceId || config.surfaceId);
          if (disposed) {
            return;
          }

          localStorage.setItem(lifecycleStorageKey(config), registeredId);
          setResolvedSurfaceId(registeredId);
          setLifecycleMessage(null);
          return;
        } catch (error) {
          setLifecycleMessage(
            `Surface registration retrying: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryMs));
          retryMs = Math.min(retryMs * 2, 30_000);
        }
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, [config, resolvedSurfaceId]);

  useEffect(() => {
    if (resolvedSurfaceId.length === 0) {
      return;
    }

    let disposed = false;
    let retryMs = 2_000;

    const heartbeatLoop = async () => {
      while (!disposed) {
        try {
          await sendHeartbeat(config, resolvedSurfaceId);
          retryMs = 2_000;
          setLifecycleMessage(null);
          await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_MS));
        } catch (error) {
          setLifecycleMessage(
            `Surface heartbeat degraded: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
          if (error instanceof Error && /\(404\)/.test(error.message)) {
            localStorage.removeItem(lifecycleStorageKey(config));
            setResolvedSurfaceId('');
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, retryMs));
          retryMs = Math.min(retryMs * 2, 30_000);
        }
      }
    };

    void heartbeatLoop();

    return () => {
      disposed = true;
    };
  }, [config, resolvedSurfaceId]);

  useEffect(() => {
    if (resolvedSurfaceId.length === 0) {
      return;
    }

    let disposed = false;
    let since = hintVersion;

    const longPollHints = async () => {
      while (!disposed) {
        try {
          const next = await fetchDisplayHintVersion(config, resolvedSurfaceId, since);
          if (disposed) {
            return;
          }

          if (next > since) {
            since = next;
            setHintVersion(next);
            await queryClient.invalidateQueries({ queryKey });
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
      }
    };

    void longPollHints();

    return () => {
      disposed = true;
    };
  }, [config, hintVersion, queryClient, queryKey, resolvedSurfaceId]);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchDisplayFeed(config, resolvedSurfaceId),
    refetchInterval: config.pollMs,
    staleTime: config.pollMs,
    retry: 1,
    enabled,
  });

  const completeChoreMutation = useMutation({
    mutationFn: async (choreId: string) => {
      const response = await fetch(
        `${deriveDashboardUrl(config.homeNodeUrl)}/api/households/${encodeURIComponent(config.householdId)}/display-actions/chores/${encodeURIComponent(choreId)}/complete`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-lifeos-surface-token': config.surfaceToken,
          },
          body: JSON.stringify({ surfaceId: resolvedSurfaceId }),
          signal: AbortSignal.timeout(4_000),
        },
      );

      if (!response.ok) {
        throw new Error(`quick action failed (${response.status})`);
      }

      return choreId;
    },
    onMutate: async (choreId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<HomeNodeDisplayFeed>(queryKey);
      if (previous) {
        queryClient.setQueryData<HomeNodeDisplayFeed>(queryKey, {
          ...previous,
          choresDueToday: previous.choresDueToday.filter((item) => item.id !== choreId),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setLifecycleMessage('Quick action failed. Retrying on next refresh.');
    },
  });

  const addShoppingMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await fetch(
        `${deriveDashboardUrl(config.homeNodeUrl)}/api/households/${encodeURIComponent(config.householdId)}/display-actions/shopping/items`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-lifeos-surface-token': config.surfaceToken,
          },
          body: JSON.stringify({ title, surfaceId: resolvedSurfaceId }),
          signal: AbortSignal.timeout(4_000),
        },
      );

      if (!response.ok) {
        throw new Error(`quick action failed (${response.status})`);
      }

      return title;
    },
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<HomeNodeDisplayFeed>(queryKey);
      if (previous) {
        queryClient.setQueryData<HomeNodeDisplayFeed>(queryKey, {
          ...previous,
          shoppingItems: [
            ...previous.shoppingItems,
            {
              id: `optimistic-${Date.now()}`,
              title,
              status: 'added',
            },
          ],
        });
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setLifecycleMessage('Quick action failed. Retrying on next refresh.');
    },
  });

  return {
    query,
    resolvedSurfaceId,
    lifecycleMessage,
    completeChore: (choreId: string) => completeChoreMutation.mutate(choreId),
    addReminderToShopping: (title: string) => addShoppingMutation.mutate(title),
    actionsPending: completeChoreMutation.isPending || addShoppingMutation.isPending,
  };
}
