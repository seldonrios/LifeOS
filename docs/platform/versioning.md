# Platform Versioning Rules

## Versioning model

- Platform surfaces version at package level unless noted otherwise.
- Event payload evolution is tracked with `BaseEvent.version`.
- Manifest schema validation is enforced by shared module-loader validation + JSON Schema.

## Versioned together

- `LifeOSModule` and `ModuleRuntimeContext` evolve together as one module runtime contract.
- `lifeos.json` validator logic and published `manifest-schema.json` evolve together.

## Versioned independently

- CLI command UX can evolve independently of event/topic contracts.
- Event topics and payloads evolve independently of life graph persistence details.
- Life Graph schema evolves independently when migration support is provided.

## Breaking vs non-breaking

### CLI
- Breaking: remove/rename command or flag, or incompatible output shape in `--json`.
- Non-breaking: additive flags, additive JSON fields, new commands.

### Event contracts
- Breaking: rename/remove topic, remove required payload field, incompatible field type change.
- Non-breaking: additive payload fields, additive metadata.

### Life Graph schema
- Breaking: remove/rename required fields or semantic reinterpretation without migration.
- Non-breaking: additive optional fields and backward-compatible defaults.

### Module manifest schema
- Breaking: remove/rename required fields or narrow accepted values without migration window.
- Non-breaking: additive optional fields with defaults and validation compatibility.

### Module runtime interfaces
- Breaking: signature changes for `LifeOSModule.init`, `dispose`, or context API methods.
- Non-breaking: additive optional context members.

## Event schema version signaling

Event producers set `BaseEvent.version` to communicate payload schema version to consumers.

## Manifest schema validation signaling

Manifests are validated by:

- `validateLifeOSManifest()` in module-loader runtime
- `manifest-schema.json` for machine validation use cases
- CLI module validation command delegating to shared validator
