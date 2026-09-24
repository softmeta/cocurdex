---
name: cocurdex-settings
description: Inspect and change Cocurdex application settings through the settings_* agent tools. Use when the user asks to view, adjust, or get recommendations for app or project settings — including worktree setup/cleanup scripts — from a chat session or the settings assistant dock.
---

# /cocurdex-settings — Control Cocurdex settings

Cocurdex exposes a catalog of controllable settings to agent sessions through the `settings` tool group. Use these tools instead of asking the user to edit values by hand.

## Tools

| Tool | Purpose |
|------|---------|
| `settings_list` | Discover which settings exist, their scope, tier, and storage. Call this first when unsure what is controllable. |
| `settings_get` | Read the current value of one setting, plus any pending proposal. |
| `settings_set` | Change a `write`-tier setting immediately. Daemon-owned values apply at once; app-UI values are queued and applied by the desktop client. |
| `settings_propose` | Submit a proposed change for `propose`-tier settings. The proposal is stored; the settings UI fills it into the fields, and it takes effect once the user saves. |

## Rules

- **Never ask for or repeat secrets.** Provider API keys, tokens, and credentials are never exposed through the catalog. If a task needs them, tell the user to configure them in Settings → Providers directly.
- **Respect the approval model.** Each catalog entry declares a tier. `read` entries are inspect-only; `write` entries accept `settings_set`; `propose` entries always go through `settings_propose` and wait for user confirmation.
- **Proposed changes are not applied by you.** After `settings_propose`, tell the user the proposal is waiting for their confirmation — the settings page fills it into the fields, and it applies only after the user saves. Do not claim the setting was changed.
- **Queued sets apply on the client.** `settings_set` on a UI-owned key (e.g. `app.theme`, `app.language`, `app.notifications`, `app.appearance`, `agent.followUpBehavior`, `chat.display`) returns `queued` — the desktop app applies it shortly. Daemon-owned keys (e.g. `git.commitMessageModel`) return `applied`.
- **Stay in scope.** Only read, set, or propose keys reported by `settings_list`. Do not invent setting keys.

## Worktree environment scripts

The `workspace.worktreeEnvironment` key controls two scripts that run in every new git worktree for this workspace:

- `setupScript` — runs once after a worktree is created (login shell, worktree root, 10-minute timeout). Typical contents: dependency install (`pnpm install`), generated code, env-file symlinks.
- `cleanupScript` — runs before a worktree is removed; failures are logged, not fatal. Always propose one: build caches, temp directories, or processes the setup script starts.

To recommend scripts:

1. Read the current values with `settings_get` so you improve rather than clobber them.
2. Explore the repository freely: lockfiles, `package.json` (`packageManager`, `scripts`, `workspaces`), `pnpm-workspace.yaml`, `turbo.json`, CI configs (`.github/workflows`), `Dockerfile`, `docker-compose.yml`, `.nvmrc`, `.tool-versions`, `mise.toml`, `devcontainer.json`, `.env.example` (key names only), and the README bootstrap section.
3. Keep scripts minimal and idempotent — they run unattended on every worktree create/remove.
4. Suggest both scripts and leave neither empty. Submit via `settings_propose` with key `workspace.worktreeEnvironment`, `setupScript`, `cleanupScript`, and a short `rationale` explaining what you found and why.
5. If the user says the suggestion is wrong, iterate: inspect more, adjust, and propose again — the new proposal replaces the pending one.
