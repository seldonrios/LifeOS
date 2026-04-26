import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

type ScaffoldType = 'typescript' | 'python';

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
  return path.join(root, 'packages', name);
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
    "test": "tsx --test \\"src/**/*.test.ts\\""
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

function getTypeLabel(type: ScaffoldType): string {
  if (type === 'typescript') {
    return 'TypeScript package';
  }

  return 'Python package';
}

function getNextSteps(type: ScaffoldType, name: string): string {
  if (type === 'typescript') {
    return 'Next: implement src/index.ts, add to tsconfig.packages.json references if needed, update docker-compose.yml if this is a service.';
  }

  return `Next: implement src/${name}/__init__.py, add dependencies to pyproject.toml.`;
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
      const retiredManifestFile = `manifest${'.'}ts`;
      const retiredReasoningPackage = `@lifeos/${'reasoning'}`;
      console.log(`LifeOS modules now use the current MVP contract.
Use: pnpm lifeos module create <name>

This creates lifeos.json + src/index.ts using @lifeos/module-sdk.
    The old ${retiredManifestFile}/${retiredReasoningPackage} scaffold has been retired.
No files were generated.`);
      rl.close();
      process.exit(0);
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
        : getPythonTemplates(name, description);

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
