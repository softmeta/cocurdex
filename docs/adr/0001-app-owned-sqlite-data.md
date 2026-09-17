# ADR 0001: App-owned SQLite data

## Status

Accepted (2026-07-25)

## Context

Notes and Issues need stable identity, transactional updates, full-text search,
backlinks, tag aggregation, and projections across workspaces. A file-backed
domain makes paths act as identity and requires watchers, parsing caches, and
conflict handling before these product capabilities can be reliable.

The product is pre-release, so obsolete local databases and file-backed
formats have no compatibility obligation.

## Decision

1. `cocurdex.sqlite` is the sole writable source of truth for Notes, Issues,
   issue views, tags, links, and search indexes.
2. The Cocurdex daemon is the sole database owner.
3. Desktop, CLI, and future MCP/SDK integrations use daemon contracts.
4. SQLite tables and the database file are private implementation details.
5. The `cocurdex` CLI is the supported external read/write interoperability
   boundary.
6. Markdown is supported only through explicit import/export flows. Cocurdex
   does not dual-write Markdown and SQLite.
7. Databases that carry the Cocurdex application marker are migrated forward
   to the current schema version. A database without the marker is moved aside
   as a `.bak-<timestamp>` file and recreated instead.
8. A migration writes a `cocurdex.sqlite.pre-migration-<timestamp>` snapshot
   first and keeps the newest three. A database written by a newer schema
   version is refused rather than downgraded or deleted.

## Consequences

- Stable UUIDs survive title changes, moves, and hierarchy changes.
- Sessions, workspaces, notes, and issues survive an application update that
  advances the schema version.
- A migration that loses data is recoverable from the pre-migration snapshot,
  so no release can silently destroy local state.
- Transactions protect multi-row updates and revision fields detect stale
  writes.
- FTS5, backlinks, and tag aggregation operate on normalized data.
- Agents and external apps retain controlled interoperability through the CLI.
- Publishing content into a repository requires an explicit export operation.
