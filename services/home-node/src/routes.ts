import type { FastifyInstance } from 'fastify';

import type { HomeNodeGraphClient } from '@lifeos/home-node-core';

export function registerHomeNodeRoutes(app: FastifyInstance, graphClient: HomeNodeGraphClient): void {
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
}
