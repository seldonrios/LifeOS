import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

type ScaffoldType = 'typescript' | 'python' | 'light-module';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function isKebabCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

class ScaffoldInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScaffoldInputError';
  }
}

function getTargetDir(type: ScaffoldType, name: string): string {
  const root = process.cwd();
  return type === 'light-module'
    ? path.join(root, 'modules', name)
    : path.join(root, 'packages', name);
}

function targetExists(type: ScaffoldType, name: string): boolean {
  return existsSync(getTargetDir(type, name));
}

function render(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value);
  }

  return result;
}

function writeFiles(baseDir: string, files: Record<string, string>): void {
  mkdirSync(baseDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(baseDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
}

function getTypeScriptTemplates(name: string, description: string): Record<string, string> {
  const vars = {
    NAME: name,
    DESCRIPTION: description,
  };

  return {
    'README.md': render(
      `# @lifeos/{{NAME}}

{{DESCRIPTION}}

## References

- TODO: Add specification and architecture references.
`,
      vars,
    ),
    'package.json': render(
      `{
  "name": "@lifeos/{{NAME}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "tsx --test 'src/**/*.test.ts'"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
`,
      vars,
    ),
    'tsconfig.json': `{
  "extends": "../tsconfig.base.json",
  "include": ["src/**/*.ts"],
  "references": []
}
`,
    'src/index.ts': render(
      `// Public API surface for @lifeos/{{NAME}}
`,
      vars,
    ),
    'src/types.ts': render(
      `// Type definitions for @lifeos/{{NAME}}
`,
      vars,
    ),
  };
}

function getPythonTemplates(name: string, description: string): Record<string, string> {
  const vars = {
    NAME: name,
    DESCRIPTION: description,
  };

  return {
    'README.md': render(
      `# lifeos-{{NAME}}

{{DESCRIPTION}}
`,
      vars,
    ),
    'pyproject.toml': render(
      `[project]
name = "lifeos-{{NAME}}"
version = "0.1.0"
description = "{{DESCRIPTION}}"
requires-python = ">=3.11"

[tool.ruff]
target-version = "py311"
line-length = 100
`,
      vars,
    ),
    [`src/${name}/__init__.py`]: render(
      `"""lifeos-{{NAME}} package."""
`,
      vars,
    ),
    [`src/${name}/types.py`]: render(
      `# Type definitions for {{NAME}}
`,
      vars,
    ),
  };
}

function getLightModuleTemplates(name: string, description: string): Record<string, string> {
  const vars = {
    NAME: name,
    NAME_PASCAL: toPascalCase(name),
    DESCRIPTION: description,
  };

  return {
    'README.md': render(
      `# {{NAME}} module

{{DESCRIPTION}}

## Purpose

- TODO: Describe the module purpose and core user outcomes.

## Event Subscriptions

- TODO: Define inbound event contracts this module subscribes to.

## Agent Role

- TODO: Define planner/executor responsibilities for this module.
`,
      vars,
    ),
    'manifest.ts': render(
      `import type { ModuleManifest } from '@lifeos/capability-registry';

export const manifest: ModuleManifest = {
  id: '{{NAME}}',
  name: '{{NAME_PASCAL}} Module',
  version: '0.1.0',
  category: 'productivity',
  runtime_profiles: ['minimal', 'assistant', 'ambient', 'production'],
  provides: [
    {
      capability: 'module.{{NAME}}.core',
      version: '0.1.0',
      description: '{{DESCRIPTION}}',
    },
  ],
  requires: [{ capability: 'core.reasoning', version_range: '^1.0.0' }],
  optional: [{ capability: 'core.life_graph', version_range: '^1.0.0' }],
  permissions: ['event_publish', 'event_subscribe'],
  hardware: [],
  degraded_modes: [
    {
      name: 'limited_mode',
      description: 'Reduced functionality when required dependencies are unavailable.',
      disabled_features: ['advanced_automation'],
    },
  ],
  entrypoint: {
    type: 'module',
    path: './agent.ts',
  },
};

export default manifest;
`,
      vars,
    ),
    'module.config.ts': render(
      `export const moduleConfig = {
  id: '{{NAME}}',
  version: '0.1.0',
  identity: {
    displayName: '{{NAME_PASCAL}} Module',
    description: '{{DESCRIPTION}}',
  },
  capabilities: ['module.{{NAME}}.core'],
};

export default moduleConfig;
`,
      vars,
    ),
    'events.ts': `// TODO: subscribe to module lifecycle and domain events.
// TODO: emit outcome and telemetry events for downstream consumers.
`,
    'schema.ts': render(
      `export const {{NAME_PASCAL}}SchemaExtension = {
  namespace: '{{NAME}}',
  entities: [],
  relations: [],
};

export default {{NAME_PASCAL}}SchemaExtension;
`,
      vars,
    ),
    'agent.ts': render(
      `import {
  LifeOSModule,
  ModuleContext,
  SystemEvent,
  LifeState,
  ModulePlan,
  PlannedAction,
  ModuleMetadata,
  ModuleCategory,
  ModulePermission,
} from '@lifeos/reasoning';

export class {{NAME_PASCAL}}Module implements LifeOSModule {
  metadata: ModuleMetadata = {
    id: '{{NAME}}',
    name: '{{NAME_PASCAL}} Module',
    version: '0.1.0',
    description: '{{DESCRIPTION}}',
    category: ModuleCategory.automation,
    permissions: [ModulePermission.EventPublish, ModulePermission.EventSubscribe],
  };

  private context: ModuleContext | null = null;

  async init(context: ModuleContext): Promise<void> {
    this.context = context;
  }

  async observe(event: SystemEvent): Promise<void> {
    void event;
  }

  async plan(state: LifeState): Promise<ModulePlan | null> {
    return {
      moduleId: this.metadata.id,
      rationale: '{{NAME_PASCAL}} planning cycle executed for ' + state.timestamp + '.',
      actions: [
        {
          id: '{{NAME}}-action-1',
          type: '{{NAME}}.action.sample',
          payload: {
            summary: state.summary,
          },
          priority: 5,
        },
      ],
    };
  }

  async act(action: PlannedAction): Promise<void> {
    void action;
    void this.context;
  }
}

export default new {{NAME_PASCAL}}Module();
`,
      vars,
    ),
    'knowledge/.gitkeep': '',
    'prompts/.gitkeep': '',
  };
}

function getTypeLabel(type: ScaffoldType): string {
  if (type === 'typescript') {
    return 'TypeScript package';
  }

  if (type === 'python') {
    return 'Python package';
  }

  return 'Light AI module';
}

function getNextSteps(type: ScaffoldType, name: string): string {
  if (type === 'typescript') {
    return 'Next: implement src/index.ts, add to tsconfig.packages.json references if needed, update docker-compose.yml if this is a service.';
  }

  if (type === 'python') {
    return `Next: implement src/${name}/__init__.py, add dependencies to pyproject.toml.`;
  }

  return 'Next: populate events.ts contracts, implement agent.ts, add domain knowledge to knowledge/.gitkeep.';
}

async function selectScaffoldType(): Promise<ScaffoldType> {
  while (true) {
    const choice = await prompt(
      'Select scaffold type: (1) TypeScript package  (2) Python package  (3) Light AI module\n> ',
    );

    if (choice === '1') {
      return 'typescript';
    }

    if (choice === '2') {
      return 'python';
    }

    if (choice === '3') {
      return 'light-module';
    }

    console.error('Invalid selection. Enter 1, 2, or 3.');
  }
}

async function promptForName(type: ScaffoldType): Promise<string> {
  while (true) {
    const name = await prompt('Package/module name (kebab-case): ');

    if (!isKebabCase(name)) {
      console.error('Invalid name. Use kebab-case (e.g. example-module).');
      continue;
    }

    if (targetExists(type, name)) {
      const targetDir = getTargetDir(type, name);
      throw new ScaffoldInputError(
        `Cannot scaffold ${getTypeLabel(type)} \"${name}\": target already exists at ${targetDir}`,
      );
    }

    return name;
  }
}

async function main(): Promise<void> {
  try {
    const type = await selectScaffoldType();
    const name = await promptForName(type);
    const description = await prompt('Short description: ');

    const baseDir = getTargetDir(type, name);

    const files =
      type === 'typescript'
        ? getTypeScriptTemplates(name, description)
        : type === 'python'
          ? getPythonTemplates(name, description)
          : getLightModuleTemplates(name, description);

    writeFiles(baseDir, files);
    console.log(`Created ${getTypeLabel(type)} at ${baseDir}`);

    const result = spawnSync('pnpm', ['run', 'validate'], {
      stdio: 'inherit',
      shell: true,
    });

    if (result.status === 0) {
      console.log('✅ pnpm run validate passed.');
      console.log(getNextSteps(type, name));
      return;
    }

    console.error('❌ pnpm run validate failed. Review errors above.');
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ScaffoldInputError) {
    console.error(error.message);
  } else {
    console.error('Scaffold failed:', error);
  }
  process.exit(1);
});
