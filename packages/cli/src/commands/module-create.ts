import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateLifeOSManifest } from '@lifeos/module-loader';

const MODULE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export interface ModuleCreateOptions {
  baseDir: string;
  author: string;
}

export interface ModuleCreateResult {
  moduleName: string;
  modulePath: string;
  manifestPath: string;
}

export interface ModuleValidateResult {
  valid: boolean;
  manifestPath: string;
  errors: string[];
}

function toModuleIdentifier(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join('');
}

export async function createModuleScaffold(
  moduleName: string,
  options: ModuleCreateOptions,
): Promise<ModuleCreateResult> {
  const normalizedName = moduleName.trim().toLowerCase();
  if (!MODULE_NAME_PATTERN.test(normalizedName)) {
    throw new Error(
      'Module name must be kebab-case and use only lowercase letters, numbers, and hyphens.',
    );
  }

  const modulePath = resolve(options.baseDir, 'modules', normalizedName);
  try {
    await stat(modulePath);
    throw new Error(`Module "${normalizedName}" already exists.`);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  await mkdir(join(modulePath, 'src'), { recursive: true });
  await mkdir(join(modulePath, 'migrations'), { recursive: true });

  const manifestPath = join(modulePath, 'lifeos.json');
  const manifest = {
    name: normalizedName,
    version: '0.1.0',
    author: options.author,
    description: `LifeOS module: ${normalizedName}`,
    graphVersion: '^2.0.0',
    permissions: {
      graph: ['read'],
      network: [],
      voice: [],
      events: [
        'subscribe:lifeos.tick',
        `publish:module.${normalizedName}.success`,
        `publish:module.${normalizedName}.error`,
      ],
    },
    resources: {
      cpu: 'low',
      memory: 'low',
    },
    requires: ['@lifeos/cli@>=0.1.0 <0.2.0', '@lifeos/module-sdk@>=0.1.0 <0.2.0'],
    category: 'custom',
    tags: ['custom'],
  };

  const moduleId = toModuleIdentifier(normalizedName);
  const source = `import type { LifeOSModule } from '@lifeos/module-sdk';

export const ${moduleId}Module: LifeOSModule = {
  id: '${normalizedName}',
  async init(context) {
    await context.subscribe('lifeos.tick', async () => {
      try {
        context.log('[${normalizedName}] reacted to lifeos.tick');
        await context.publish('module.${normalizedName}.success', { handled: 'lifeos.tick' }, '${normalizedName}');
      } catch (error: unknown) {
        await context.publish(
          'module.${normalizedName}.error',
          {
            message: error instanceof Error ? error.message : String(error),
          },
          '${normalizedName}',
        );
      }
    });
  },
};
`;

  const testSource = `import assert from 'node:assert/strict';
import test from 'node:test';

import type { LifeOSModule } from '@lifeos/module-sdk';

import { ${moduleId}Module } from './index';

test('${normalizedName} reacts to tick and publishes module events', async () => {
  const moduleCandidate = ${moduleId}Module as LifeOSModule;
  assert.equal(moduleCandidate.id, '${normalizedName}');
  assert.equal(typeof moduleCandidate.init, 'function');

  const subscriptions = new Map<string, (event: unknown) => Promise<void> | void>();
  const published: string[] = [];
  const context: Parameters<LifeOSModule['init']>[0] = {
    env: process.env,
    eventBus: {
      async publish() {
        return;
      },
      async subscribe() {
        return;
      },
      async close() {
        return;
      },
      getTransport() {
        return 'in-memory';
      },
    },
    createLifeGraphClient() {
      throw new Error('not used in scaffold test');
    },
    async subscribe(topic, handler) {
      subscriptions.set(topic, handler as (event: unknown) => Promise<void> | void);
    },
    async publish(topic) {
      published.push(topic);
      return {
        id: 'evt_test',
        type: topic,
        timestamp: new Date().toISOString(),
        source: '${normalizedName}',
        version: '0.1.0',
        data: {},
      };
    },
    log() {
      return;
    },
  };

  await moduleCandidate.init(context);
  const handler = subscriptions.get('lifeos.tick');
  assert.ok(handler);
  await handler?.({});
  assert.ok(published.includes('module.${normalizedName}.success'));
});
`;

  const readmeSource = `# ${normalizedName}

Generated with LifeOS module scaffold.

## Modularity Risk Checklist

- [ ] \`requires\` uses bounded semver ranges in \`lifeos.json\` (example: \`@lifeos/module-sdk@>=0.1.0 <0.2.0\`)
- [ ] Includes empty \`migrations/\` folder
- [ ] Emits \`module.${normalizedName}.success\` and \`module.${normalizedName}.error\` events
- [ ] Passes \`pnpm lifeos module validate ${normalizedName}\`
- [ ] Tested against latest compatibility matrix
- [ ] Resources (\`cpu\`, \`memory\`) are declared in manifest
`;

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(join(modulePath, 'src', 'index.ts'), source, 'utf8');
  await writeFile(join(modulePath, 'src', 'index.test.ts'), testSource, 'utf8');
  await writeFile(join(modulePath, 'README.md'), readmeSource, 'utf8');
  await writeFile(join(modulePath, 'migrations', '.gitkeep'), '', 'utf8');

  return {
    moduleName: normalizedName,
    modulePath,
    manifestPath,
  };
}

export async function validateModuleManifest(
  moduleName: string,
  baseDir: string,
  cliVersion?: string,
): Promise<ModuleValidateResult> {
  const normalizedName = moduleName.trim().toLowerCase();
  if (!MODULE_NAME_PATTERN.test(normalizedName)) {
    return {
      valid: false,
      manifestPath: resolve(baseDir, 'modules', normalizedName, 'lifeos.json'),
      errors: [
        'Module name must be kebab-case and use only lowercase letters, numbers, and hyphens.',
      ],
    };
  }

  const manifestPath = resolve(baseDir, 'modules', normalizedName, 'lifeos.json');
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      manifestPath,
      errors: [`Unable to read manifest: ${message}`],
    };
  }

  const result = validateLifeOSManifest(raw, cliVersion ? { cliVersion } : {});
  return {
    valid: result.valid,
    manifestPath,
    errors: result.errors,
  };
}
