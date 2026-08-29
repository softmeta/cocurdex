# Cocurdex

Cocurdex is a desktop-first multi-agent development workspace. Chat, terminal,
editor, and browser preview stay in one shell so you can run several AI coding
agents without losing track of which session needs you.

Pre-release. macOS is the primary platform; Windows and Linux follow.

[Documentation](https://cocurdex.com/docs/) ·
[Getting started](https://cocurdex.com/docs/getting-started/)

## License

Cocurdex is **source-available** under the
[Functional Source License 1.1](LICENSE.md) (`FSL-1.1-ALv2`), which becomes
Apache-2.0 two years after each version is published.

During the FSL period, Cocurdex is source-available rather than OSI-approved
open-source software.

You may use, modify, and self-host Cocurdex, including inside a company. You
may not offer Cocurdex as a competing product or hosted service. The Cocurdex
name and marks stay with softmeta LLC.

See [LICENSE.md](LICENSE.md) for the full terms, and
[CONTRIBUTING.md](CONTRIBUTING.md) if you want to submit a change.

Security reports must follow [SECURITY.md](SECURITY.md). General support is
described in [SUPPORT.md](SUPPORT.md), and use of the Cocurdex name and marks is
governed by [TRADEMARKS.md](TRADEMARKS.md).

## Run from source

You need Node.js 22 and pnpm.

```bash
pnpm install
pnpm --filter @cocurdex/desktop dev
```

Install and authenticate at least one agent CLI you already use (`claude`,
`codex`, `opencode`, `grok`, and others). Cocurdex drives those runtimes; it
does not ship model access.

The desktop app starts a local daemon. No Cocurdex account is required.

## Product data

`cocurdex.sqlite` is the sole source of truth for app-owned Notes, Issues,
views, tags, links, and full-text search indexes. The Cocurdex daemon is the
only process that opens the database.

Desktop, CLI, and future integrations use the daemon API. External tools must
use the `cocurdex` CLI rather than reading or writing the private SQLite schema.
Markdown is an explicit import/export format, never a second writable store.

## Repository

| Path | Role |
|------|------|
| `apps/desktop` | Electron desktop app |
| `apps/cli` | `cocurdex` CLI |
| `packages/daemon` | Local daemon (owns SQLite and agent runtimes) |
| `packages/rpc` | Desktop/CLI ↔ daemon contract (internal; no compatibility promise yet) |
| `apps/web` | Marketing and docs site |
| `apps/console` | Team console (early) |
| `apps/api` | Team HTTP API (early; self-hosting comes later) |

The desktop works without `apps/api`. Team sync and a self-hosted control plane
are planned; they will use the same source-available terms.

User-facing docs: [apps/web](apps/web/README.md) and
[cocurdex.com/docs](https://cocurdex.com/docs/). Engineering ADRs live in
`docs/adr/`.
