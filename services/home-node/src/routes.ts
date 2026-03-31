import { randomUUID, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  SurfaceCapabilitySchema,
  SurfaceKindSchema,
  SurfaceTrustLevelSchema,
  type HomeNodeSurfaceRegistered,
} from '@lifeos/contracts';
import type { HomeNodeGraphClient } from '@lifeos/home-node-core';

const RegisterSurfaceRequestSchema = z
  .object({
    surface_id: z.string().min(1).optional(),
    zone_id: z.string().min(1),
    home_id: z.string().min(1),
    kind: SurfaceKindSchema,
    trust_level: SurfaceTrustLevelSchema,
    capabilities: z.array(SurfaceCapabilitySchema),
    registered_at: z.string().datetime().optional(),
    last_seen_at: z.string().datetime().optional(),
  })
  .strict();

const CreateHomeRequestSchema = z
  .object({
    home_id: z.string().min(1),
    household_id: z.string().min(1),
    name: z.string().min(1),
    timezone: z.string().min(1),
    quiet_hours_start: z.string().optional(),
    quiet_hours_end: z.string().optional(),
    routine_profile: z.string().optional(),
  })
  .strict();

const CreateZoneRequestSchema = z
  .object({
    zone_id: z.string().min(1),
    home_id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['kitchen', 'hallway', 'bedroom', 'office', 'entryway', 'living_room', 'other']),
  })
  .strict();

const SURFACE_SECRET_HEADER = 'x-lifeos-surface-secret';

export interface HomeNodeRouteHooks {
  onSurfaceRegistered?: (surface: HomeNodeSurfaceRegistered) => Promise<void>;
  onSurfaceDeregistered?: (surface: HomeNodeSurfaceRegistered) => Promise<void>;
}

function parseBooleanFilter(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
}

function validateRouteSecret(expectedSecret: string, providedSecret: string | null | undefined): boolean {
  if (!providedSecret) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedSecret.trim(), 'utf8');
  const providedBuffer = Buffer.from(providedSecret.trim(), 'utf8');
  if (expectedBuffer.length === 0 || expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isAuthorizedSurfaceMutation(
  expectedSecret: string,
  request: { headers?: Record<string, string | string[] | undefined>; body?: unknown },
): boolean {
  const providedFromHeader = readHeaderValue(request.headers?.[SURFACE_SECRET_HEADER]);
  const providedFromBody =
    typeof (request.body as { surface_secret?: unknown } | undefined)?.surface_secret === 'string'
      ? (request.body as { surface_secret?: string }).surface_secret
      : undefined;

  return validateRouteSecret(expectedSecret, providedFromHeader ?? providedFromBody ?? null);
}

export function registerHomeNodeRoutes(
  app: FastifyInstance,
  graphClient: HomeNodeGraphClient,
  hooks: HomeNodeRouteHooks = {},
): void {
  const expectedSurfaceSecret = process.env.LIFEOS_HOME_NODE_SURFACE_SECRET ?? '';

  app.post('/api/home-node/homes', async (request, reply) => {
    try {
      const payload = CreateHomeRequestSchema.parse(request.body ?? {});
      const home = graphClient.upsertHome({
        homeId: payload.home_id,
        householdId: payload.household_id,
        name: payload.name,
        timezone: payload.timezone,
        quietHoursStart: payload.quiet_hours_start,
        quietHoursEnd: payload.quiet_hours_end,
        routineProfile: payload.routine_profile,
      });

      return reply.code(201).send(home);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid home payload' });
      }

      return reply.code(500).send({ error: 'Failed to create home' });
    }
  });

  app.post('/api/home-node/zones', async (request, reply) => {
    try {
      const payload = CreateZoneRequestSchema.parse(request.body ?? {});
      if (!graphClient.getHomeById(payload.home_id)) {
        return reply.code(404).send({ error: `home ${payload.home_id} was not found` });
      }

      const zone = graphClient.upsertZone({
        zoneId: payload.zone_id,
        homeId: payload.home_id,
        name: payload.name,
        type: payload.type,
      });

      return reply.code(201).send(zone);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid zone payload' });
      }

      return reply.code(500).send({ error: 'Failed to create zone' });
    }
  });

  app.get('/api/home-node/snapshot/:householdId', async (request, reply) => {
    const householdId = String((request.params as { householdId?: string }).householdId ?? '').trim();
    if (householdId.length === 0) {
      return reply.code(400).send({ error: 'householdId is required' });
    }

    const snapshot = graphClient.getHomeStateSnapshot(householdId);
    if (!snapshot) {
      return reply.code(404).send({ error: 'Snapshot not found' });
    }

    return reply.code(200).send(snapshot);
  });

  const registerSurfaceHandler = async (
    request: Parameters<FastifyInstance['post']>[1] extends (...args: infer A) => unknown ? A[0] : never,
    reply: Parameters<FastifyInstance['post']>[1] extends (...args: infer A) => unknown ? A[1] : never,
  ) => {
    try {
      if (!isAuthorizedSurfaceMutation(expectedSurfaceSecret, request)) {
        return reply.code(401).send({ error: 'Unauthorized surface mutation request' });
      }

      const payload = RegisterSurfaceRequestSchema.parse(request.body ?? {});
      const surface = graphClient.registerSurface({
        surfaceId: payload.surface_id ?? randomUUID(),
        zoneId: payload.zone_id,
        homeId: payload.home_id,
        kind: payload.kind,
        trustLevel: payload.trust_level,
        capabilities: payload.capabilities,
        registeredAt: payload.registered_at,
        lastSeenAt: payload.last_seen_at,
      });

      await hooks.onSurfaceRegistered?.(surface);
      return reply.code(201).send(surface);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid surface registration payload' });
      }

      if (error instanceof Error) {
        if (error.message.includes('was not found')) {
          return reply.code(404).send({ error: error.message });
        }

        if (
          error.message.includes('does not belong to home') ||
          error.message.includes('trust level is immutable once registered')
        ) {
          return reply.code(409).send({ error: error.message });
        }
      }

      return reply.code(500).send({ error: 'Failed to register surface' });
    }
  };

  app.post('/api/home-node/surfaces/register', registerSurfaceHandler);
  app.post('/api/home-node/surfaces', registerSurfaceHandler);

  app.delete('/api/home-node/surfaces/:surfaceId', async (request, reply) => {
    if (!isAuthorizedSurfaceMutation(expectedSurfaceSecret, request)) {
      return reply.code(401).send({ error: 'Unauthorized surface mutation request' });
    }

    const surfaceId = String((request.params as { surfaceId?: string }).surfaceId ?? '').trim();
    if (surfaceId.length === 0) {
      return reply.code(400).send({ error: 'surfaceId is required' });
    }

    const surface = graphClient.deregisterSurface(surfaceId);
    if (!surface) {
      return reply.code(404).send({ error: 'Surface not found' });
    }

    await hooks.onSurfaceDeregistered?.(surface);
    return reply.code(200).send({ surface_id: surfaceId, status: 'deregistered' });
  });

  app.get('/api/home-node/surfaces', async (request, reply) => {
    const query = request.query as {
      householdId?: string;
      homeId?: string;
      zoneId?: string;
      active?: string;
    };

    const householdId = query.householdId?.trim() ?? '';
    if (householdId.length === 0) {
      return reply.code(400).send({ error: 'householdId is required' });
    }

    const surfaces = graphClient.listSurfaces({
      householdId,
      homeId: query.homeId?.trim() || undefined,
      zoneId: query.zoneId?.trim() || undefined,
      active: parseBooleanFilter(query.active),
    });

    return reply.code(200).send({ items: surfaces, count: surfaces.length });
  });

  app.post('/api/home-node/surfaces/:surfaceId/heartbeat', async (request, reply) => {
    if (!isAuthorizedSurfaceMutation(expectedSurfaceSecret, request)) {
      return reply.code(401).send({ error: 'Unauthorized surface mutation request' });
    }

    const surfaceId = String((request.params as { surfaceId?: string }).surfaceId ?? '').trim();
    if (surfaceId.length === 0) {
      return reply.code(400).send({ error: 'surfaceId is required' });
    }

    const heartbeatAt =
      typeof (request.body as { seen_at?: unknown } | undefined)?.seen_at === 'string'
        ? (request.body as { seen_at?: string }).seen_at
        : undefined;
    const surface = graphClient.recordSurfaceHeartbeat(surfaceId, heartbeatAt);
    if (!surface) {
      return reply.code(404).send({ error: 'Surface not found' });
    }

    return reply.code(200).send(surface);
  });
}
