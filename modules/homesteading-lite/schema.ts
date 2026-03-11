import type { ModuleSchema } from '@lifeos/life-graph';

export const moduleSchema: ModuleSchema = {
  meta: {
    id: 'homesteading-lite.schema',
    version: '0.1.0',
    module: 'homesteading-lite',
  },
  entities: [
    {
      entity: 'homestead.Plant',
      properties: {
        species: 'string',
        variety: 'string',
        planted_at: 'string',
        status: 'string',
      },
    },
    {
      entity: 'homestead.Harvest',
      properties: {
        crop: 'string',
        harvested_at: 'string',
        quantity: 'number',
        unit: 'string',
      },
    },
    {
      entity: 'homestead.ProductionSystem',
      properties: {
        name: 'string',
        method: 'string',
        zone: 'string',
      },
    },
  ],
  relationships: [
    {
      type: 'homestead.system.grows',
      from: 'homestead.ProductionSystem',
      to: 'homestead.Plant',
    },
    {
      type: 'homestead.plant.produces',
      from: 'homestead.Plant',
      to: 'homestead.Harvest',
    },
  ],
  properties: [
    {
      target: 'Resource',
      property: 'homestead_zone',
      type: 'string',
      required: false,
    },
  ],
};
