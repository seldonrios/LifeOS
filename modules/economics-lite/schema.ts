import type { ModuleSchema } from '@lifeos/life-graph';

export const moduleSchema: ModuleSchema = {
  meta: {
    id: 'economics-lite.schema',
    version: '0.1.0',
    module: 'economics-lite',
  },
  entities: [
    {
      entity: 'economics.Budget',
      properties: {
        name: 'string',
        period: 'string',
        target: 'number',
        spent: 'number',
      },
    },
    {
      entity: 'economics.MarketOpportunity',
      properties: {
        title: 'string',
        score: 'number',
        status: 'string',
      },
    },
    {
      entity: 'economics.IncomeStream',
      properties: {
        name: 'string',
        cadence: 'string',
        amount: 'number',
      },
    },
  ],
  relationships: [
    {
      type: 'economics.budget.funded_by',
      from: 'economics.Budget',
      to: 'economics.IncomeStream',
    },
    {
      type: 'economics.opportunity.supports_budget',
      from: 'economics.MarketOpportunity',
      to: 'economics.Budget',
    },
  ],
  properties: [
    {
      target: 'Goal',
      property: 'budget_id',
      type: 'string',
      required: false,
    },
  ],
};
