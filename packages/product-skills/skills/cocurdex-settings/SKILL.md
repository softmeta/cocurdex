---
name: cocurdex-settings
description: Inspect and change Cocurdex application settings through the settings_* agent tools. Use when the user asks to view, adjust, or get recommendations for app or project settings — including worktree setup/cleanup scripts, model providers, and the MCP servers Cocurdex gives its agents — from a chat session or the settings assistant dock.
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

- **Never ask for or repeat secrets.** Provider API keys, tokens, and credentials are never exposed through the catalog. If a task needs them, tell the user to configure them in Settings → Providers, or to run `cocurdex provider login <id>` or `cocurdex provider key set <id>` in their own terminal.
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

## Agent run limits

The daemon-owned `agents.runLimits` key (`write` tier, applies at once) caps parallel agent work:

- `maxConcurrentRuns` (1–64, default 8) — runs across all sessions.
- `maxConcurrentRunsPerAgent` (1–64, default 4) — runs of one agent type.
- `delegatedRunTimeoutMinutes` (1–1440 or `null`, default 60) — a teammate or subagent run that exceeds it fails with "Run timed out".

Only delegated runs (teammates and spawned subagents) wait for capacity, in arrival order; runs the user starts are never held but count toward the limits. Read the value with `settings_get` before changing it, and send all three fields with `settings_set`.

## Providers

Model providers are configured through the `cocurdex provider` CLI (or Settings → Providers), not the settings catalog. Run `cocurdex provider --help` for the full command list.

- Inspect: `cocurdex provider list`, `cocurdex provider templates`, `cocurdex provider models <id> [--refresh]`, `cocurdex provider status <id>`, `cocurdex provider default`. Add `--json` for machine-readable output.
- Configure: `cocurdex provider add <id> --template <template-id>` for a built-in provider, or `--name <name> --base-url <url>` for a custom endpoint. `cocurdex provider update <id>`, `cocurdex provider remove <id>`, `cocurdex provider model add|remove`, and `cocurdex provider default --agent <agent> --provider <id> --model <model-id>` change the rest.
- Move configs in bulk with pi's `models.json` format: `cocurdex provider import <file|->` upserts providers and models, and `cocurdex provider export [--output <file>]` writes them out. Exports never include stored API keys or OAuth logins, but custom `headers` are exported as-is.
- Credentials are the user's step. `cocurdex provider login <id>` runs OAuth or API-key login interactively, and `cocurdex provider key set <id>` reads a key from stdin. Suggest the command; never run them with a secret you were given. A built-in provider lists no models and is hidden from model pickers until it has a credential; `cocurdex provider status <id>` shows whether it does.

## Agent sign-in

ACP agents installed from the registry (`acp:<id>`, such as Antigravity, Cursor, or Devin) sign in through the agent itself, not through a Cocurdex provider.

- Inspect: `cocurdex agent auth <agent> [--json]` lists the login methods the agent offers (`*` marks the one in use), whether it supports logging out, and how many of its sessions are running. ACP does not report which account is signed in; never guess one.
- Switch or repeat a login: `cocurdex agent login <agent> [--method <method-id>]` authenticates with the chosen method, usually by opening the browser for the user to approve, and remembers it once it succeeds; a failed login keeps the previous method. Switching to a different method stops that agent's running sessions first. `cocurdex agent login cancel <agent>` abandons a login that is waiting on the browser.
- `cocurdex agent logout <agent>` stops that agent's running sessions and signs it out; it fails for agents without logout support.
- These are the user's steps: they stop sessions and may change which account the agent bills. Suggest the command and run it only when the user asks for it.

## MCP servers

Cocurdex keeps one MCP server list, configured through the `cocurdex mcp` CLI (or Settings → MCP). It lives in Pi's `mcp.json` under the app's data folder; a workspace can add servers in `<workspace>/.pi/mcp.json`, which the CLI and settings page only read. Each server names the agents that receive it, Pi by default. Cocurdex hands a server to Claude Code, Codex, OpenCode, and ACP agents when it starts their sessions; it never edits those agents' own MCP configs, so do not edit them either.

- Inspect: `cocurdex mcp list [--workspace <id|path>] [--json]` connects to every server the way a Pi session does and reports its state (`connected`, `needs-auth`, `failed`, `disabled`), tools, and errors; it exits 1 when an enabled server is not connected. `cocurdex mcp test <name>` checks one server. `cocurdex mcp show [<name>]` prints the config with literal header, env, and OAuth secrets redacted.
- Configure: `cocurdex mcp add <name> -- <command> [args...]` for a local server (`--env KEY=VALUE`, `--cwd`), or `cocurdex mcp add <name> --url <url>` for a remote one (`--header KEY=VALUE`, `--bearer-token-env-var NAME` writes `Authorization: Bearer ${NAME}`). Adding an existing name replaces it. `cocurdex mcp remove|enable|disable <name>` change the rest. Pi validates every write and rejects what it cannot run, such as legacy SSE servers.
- Agents: `cocurdex mcp agents <name>` shows which agents receive a server; `cocurdex mcp agents <name> pi codex claude-agent acp:<id>` replaces that list and `--none` empties it (`cocurdex mcp add ... --agent <id>` sets it while adding). The change applies to sessions started afterwards. Only Pi receives servers that set `cwd`, sign in through a Pi provider, use a `!command` value, or reference an environment variable the daemon lacks; the command reports this as `unsupported`. OpenCode shares one service per workspace folder, so a server given to OpenCode also appears in the user's own OpenCode sessions in that folder until the service restarts. Other agents get `${VAR}` references expanded but not Pi's OAuth sign-in, so an OAuth server needs the user to sign in within that agent too. `cocurdex mcp list` checks connections the way a Pi session does.
- Import: `cocurdex mcp import <file|->` reads `{"mcpServers": {...}}` JSON (or a bare `"name": {...}` fragment) and skips names that already exist unless `--overwrite`. `cocurdex mcp import --from claude|claude-project|codex|codex-project|cursor|opencode|opencode-project|antigravity [--name <name>]...` copies servers from another agent's config on this computer (Codex `config.toml` and OpenCode `opencode.json(c)` are converted to the same JSON shape; `*-project` reads the workspace root).
- Credentials are the user's step. Prefer `${VAR}` references in headers and env over literal tokens. Remote servers without an `Authorization` header sign in with OAuth: suggest `cocurdex mcp login <name>`, which opens the browser for the user to approve; `cocurdex mcp logout <name>` removes the stored sign-in.
- New and changed servers take effect in new Pi sessions; running sessions keep the servers they started with.

## Remote devices

Other devices (the cocurdex mobile app) reach this host through the `cocurdex host` CLI or Settings → Devices. Remote access is off by default. Every remote connection is end-to-end encrypted to this host's key, and a paired device proves itself with its own key, so nothing on the network can read or impersonate either side.

- Inspect: `cocurdex host status` shows the host id, whether remote access is listening, and its LAN/Tailscale addresses. `cocurdex host devices`, `cocurdex host pairings`, and `cocurdex host audit [--limit <n>]` list paired devices, pending pairings, and the access log. Add `--json` for machine-readable output.
- Change: `cocurdex host remote enable [--port <port>] [--keep-awake on|off]` / `cocurdex host remote disable`; `--keep-awake on` makes the desktop app stop the computer from idle-sleeping while remote access is on, so a phone can reach it away from home (a closed laptop lid still sleeps); `cocurdex host pair --label <name> [--scopes read,interact,approvals] [--ttl <minutes>]` prints a one-time code and pairing links that carry the code and the host's public key; `cocurdex host pairing cancel <pairing-id>`; `cocurdex host revoke <device-id>` disconnects a device immediately; `cocurdex host scopes <device-id> --scopes <list>` replaces an active device's scopes (any scope except `host.admin`), reconnecting it so the new scopes apply at once.
- Pair a phone: open a pairing link (or scan its QR code in Settings → Devices) with the cocurdex mobile app. A browser on another machine cannot pair; the web client opens only from the desktop app on this computer. Devices paired before end-to-end encryption must pair again.
- Scopes: `read`, `interact`, `execute`, `files.read`, `files.write`, `git.destructive`, `approvals`, `credentials`. `host.admin` is never granted to a paired device. Default to the narrowest set the user asks for.
- To control the computer away from its network, both the computer and the phone need Tailscale: pair with the Tailscale link (or any link; the phone learns every address the host reports and switches to the one that answers).
- Some builds disable remote access: `cocurdex host status` then reports `remoteAccess.allowed: false`, and `host remote enable` and `host pair` fail with "Remote access is disabled in this build". Tell the user instead of retrying.
- Only enable remote access, create pairings, or widen scopes when the user explicitly asks. Hand the pairing code or link to the user; never send it anywhere else.
