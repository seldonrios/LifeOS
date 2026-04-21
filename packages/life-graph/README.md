# @lifeos/life-graph

Persistence and graph layer for LifeOS.

## Storage Backends

- Primary backend: SQLite via better-sqlite3. Graph persistence is initialized and managed through saveGraphAtomic and LifeGraphManager.
- Fallback backend: JSON file storage using life-graph.json when SQLite is unavailable or when forceJsonAdapter: true is configured.

## Spec References

- [Life Graph Schema and Modular Ontology Architecture](../../docs/architecture/life-graph.md)
