# Module Template

This template is for external LifeOS module authors.

## Included files

- `lifeos.json`: module manifest
- `package.json`: package metadata with `@lifeos/module-sdk`
- `tsconfig.json`: TypeScript config
- `src/index.ts`: module entrypoint
- `src/index.test.ts`: starter test with event bus + graph mocking pattern
- `migrations/.gitkeep`: reserved migration folder

## Quick start

1. Copy this template into `modules/<your-module>`.
2. Update manifest and package metadata.
3. Implement module logic in `src/index.ts`.
4. Run tests and `pnpm lifeos module validate <your-module>`.
