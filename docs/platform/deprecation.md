# Platform Deprecation Policy

## Minimum warning period

Deprecated public platform items must remain available for at least 2 minor releases before removal.

## Required deprecation metadata

Each deprecation entry must include:

- Item name and surface (CLI, event, graph schema, manifest field, API)
- Deprecation version
- Planned removal version (minimum +2 minor)
- Replacement path
- Migration notes link

## CLI warning format

Use the following warning format for deprecated CLI usage:

`[deprecation] <item> is deprecated since <version>; use <replacement>. Planned removal: <version>.`

## Removal timing rules

- No earlier than 2 minor versions after deprecation.
- Removal must include migration note and changelog entry.
- Breaking removals require RFC.
