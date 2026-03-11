import { z } from 'zod';

export const ConfigSchema = z
  .object({
    profile: z.string().min(1).default('assistant'),
    logLevel: z.string().default('info'),
    smtp: z
      .object({
        host: z.string().min(1),
        port: z.number().int().positive(),
      })
      .default({ host: 'localhost', port: 1025 }),
    features: z
      .object({
        voice: z.boolean().default(false),
        vision: z.boolean().default(false),
        localLlm: z.boolean().default(false),
        cloudLlm: z.boolean().default(true),
        automation: z.boolean().default(true),
        scheduling: z.boolean().default(true),
        deviceControl: z.boolean().default(false),
        backgroundAgents: z.boolean().default(true),
      })
      .strict(),
    services: z
      .object({
        secretsService: z
          .object({ host: z.string().min(1), port: z.number().int().positive() })
          .strict(),
        serviceCatalog: z
          .object({ host: z.string().min(1), port: z.number().int().positive() })
          .strict(),
        featureFlagService: z
          .object({ host: z.string().min(1), port: z.number().int().positive() })
          .strict(),
        moduleLoader: z
          .object({ host: z.string().min(1), port: z.number().int().positive() })
          .strict(),
      })
      .strict(),
    modules: z
      .object({
        enabled: z.array(z.string().min(1)),
      })
      .strict(),
    hardware: z
      .object({
        available: z.array(z.string().min(1)).default([]),
      })
      .strict(),
  })
  .strict();
