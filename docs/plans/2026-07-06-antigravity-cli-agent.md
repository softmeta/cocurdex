# Antigravity CLI Agent Integration (`agy` headless)

Status: approved plan, not yet implemented.
Executor: any coding agent (written to be self-contained; verify file/line references against the current tree before editing).

## Context

Add Google Antigravity CLI (`agy`) as a new selectable agent in Cocurdex, alongside `claude-code`, `codex`, `opencode`, `pi`. The user runs sessions on their own installed, own-authenticated `agy` binary (Google Sign-In via system keyring) — no API key, no provider config. This is the same "provider-optional" shape as `codex` in ChatGPT-login state, and the same "spawn the user's local CLI" shape as the parallel plan `2026-07-06-claude-local-cli-agent.md` (read it for precedent; the two features are independent and can land in any order).

### Ground truth about the CLI (verified locally against agy 1.0.16 on 2026-07-06)

Do **not** trust third-party blog posts about flags (`--yes`, `--output json` do not exist). Re-verify against the installed binary with `agy --help` before implementing — the tool updates frequently (see changelog: <https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md>). Official docs (<https://antigravity.google/docs/cli-overview>) are SPA-rendered; use the GitHub README and `agy --help` as sources of truth.

Relevant flags (from `agy --help`, 1.0.16):

| Flag | Meaning |
|---|---|
| `-p` / `--print` | Run a single prompt non-interactively, print response, exit |
| `--output-format json` | **Undocumented in `--help` but present and working**: print-mode result as one JSON object |
| `--conversation <id>` | Resume a previous conversation by ID |
| `--model <name>` | Model for the session (`agy models` lists them) |
| `--add-dir <path>` | Add a directory to the workspace (repeatable) |
| `--print-timeout <dur>` | Print-mode wait timeout, default `5m0s` (Go duration syntax, e.g. `30m`) |
| `--dangerously-skip-permissions` | Auto-approve all tool permission requests |
| `--sandbox` | Sandbox with terminal restrictions |
| `--log-file <path>` | Override CLI log file path |

Verified print-mode output (stdout, single line):

```json
{"conversation_id":"3819cb38-…","status":"SUCCESS","response":"ok\n","duration_seconds":5.27,"num_turns":1,"usage":{"input_tokens":18973,"output_tokens":299,"thinking_tokens":293,"total_tokens":19272}}
```

Hard constraints this shape imposes:

- **No streaming.** Print mode emits one final JSON object — no deltas, no tool events. The UI gets the whole answer at once.
- **No mid-turn permission prompts.** There is no interactive approval channel in print mode.
- Multi-turn works by re-spawning with `--conversation <id>` using the `conversation_id` from the previous turn's result. Conversation state lives in `~/.gemini/antigravity-cli/` on the user's machine.

## Design decisions

### New agent id: `antigravity`

Standalone `AgentId` `"antigravity"`, executable name `agy`. No provider dependency — follow the codex provider-optional precedent in the session-creation UI and runtime. No new IPC channels in `provider-service` (no account flow; auth is the user's own `agy` login).

### Process model: one spawn per turn + `--conversation`

Per user turn, spawn:

```
agy -p "<prompt>" --output-format json --print-timeout 30m [--conversation <id>] [--model <m>]
```

- cwd = session workspace root.
- First turn has no `--conversation`; parse `conversation_id` from the result and persist it via the existing `providerSession` / `onProviderSessionUpdate` mechanism (see how codex persists its rollout/session handle in `packages/daemon/src/runtime.ts` → `createSession` args) so resume survives app restarts.
- Stop = kill the child process (SIGTERM, then SIGKILL after grace). The conversation id from the *previous* completed turn stays valid.
- Raise `--print-timeout` well above the default 5m (30m) so long agent turns are not cut off; surface a timeout as an `error` AgentEvent.

### Capabilities (agent-registry descriptor)

```ts
{
  id: "antigravity",
  label: "Antigravity",
  availability: "available",
  capabilities: {
    collaborationModes: ["default"],        // no plan mode in print mode
    writeModes: ["read-only", "native-write"],
    supportsStreaming: false,               // single final message per turn
    supportsSelections: true,               // selections are just prompt text
  },
}
```

Check how the renderer treats `supportsStreaming: false` — if every existing adapter streams and the chat UI assumes deltas, emit the final response as one `message.delta` immediately followed by `message.completed` so no new UI path is needed.

### Permission model (v1: coarse mapping only)

There is no permission-mode flag; only all-or-nothing `--dangerously-skip-permissions` and `--sandbox`. Mapping:

| App mode | Flags |
|---|---|
| read-only | `--sandbox` (terminal restrictions) |
| accept-edits | *(none — CLI default permission rules apply)* |
| bypass | `--dangerously-skip-permissions` |

**Task 0 for the executor (empirical, before writing the adapter):** determine what print mode does when a tool needs approval under default permissions — auto-deny, or hang until `--print-timeout`. Test with something like `agy -p "run the shell command: touch /tmp/agy-perm-test" --output-format json` in a scratch dir. If it hangs, v1 must document that non-bypass modes can stall and map the stall to a friendly error; if it auto-denies, map denial text to a normal turn result. Record the finding in a code comment in the adapter.

v1 limitation (code comment + capability declaration): no per-tool interactive approval; `requestPermission` from the daemon is never called by this adapter.

### Output parsing: result JSON → AgentEvent

New pure-function module `antigravity-print-output.ts` (TDD — this is exactly the "critical pure function" case the repo's TDD rule targets):

- Input: full stdout string (+ exit code, stderr). Output: a parsed result or a typed error.
- `status: "SUCCESS"` → `message.delta`(full text) + `message.completed` + `turn.completed` (map `usage` into the existing turn-statistics shape used by `feat(chat): track and display agent turn statistics` — see `codex-turn-stream.ts` for the event vocabulary in `packages/agent-core/src/agent-events.ts`).
- Non-SUCCESS `status`, non-JSON stdout, non-zero exit, or timeout → `error` AgentEvent. If stderr/stdout indicates auth failure, attach a hint telling the user to run `agy` once in their terminal to complete Google Sign-In (the CLI cannot be logged in from inside the app; browser-based flow).
- Tolerate leading non-JSON noise on stdout (scan for the last line that parses as an object with `conversation_id`/`status`) — the CLI may print warnings before the result.

### Detection and availability

Resolve `agy` from PATH (plus `~/.local/bin` — the installer's default, which may not be on the GUI app's PATH on macOS; reuse whatever PATH-augmentation the codex/opencode adapters already do in `packages/agent-adapters/src/shared/process-env.ts`). Missing binary → availability `"missing"` with an install hint (`https://antigravity.google/docs/cli-overview`). `agy --version` (fast, no auth) is the health check.

### Models (v1: optional)

`agy models` lists available models. v1 may skip model selection entirely (omit `--model`, use the user's CLI default). If the session UI requires a model picker for this agent, shell out to `agy models` and parse; follow the opencode-models precedent. Prefer skipping in v1 — smallest diff.

## Files to change

| File | Change |
|---|---|
| `packages/shared/src/contracts.ts` | Add `"antigravity"` to the `AgentId` union (line 1) |
| `packages/agent-core/src/agent-registry.ts` | `agentExecutableNames`: `antigravity: "agy"`; descriptor as above |
| `packages/agent-adapters/src/antigravity/antigravity-print-output.ts` (+ `.test.ts`) | Pure parser: result JSON / errors → AgentEvents, TDD |
| `packages/agent-adapters/src/antigravity/antigravity-adapter.ts` | Adapter: spawn per turn, arg building, conversation-id persistence, kill/stop, availability |
| `packages/agent-adapters/src/antigravity/index.ts` | Barrel export |
| `packages/agent-adapters/src/index.ts` | `export * from "./antigravity";` |
| `packages/daemon/src/runtime.ts` | `createAgentAdapter` switch: `case "antigravity": return createAntigravityAdapter();` (~line 388) |
| `apps/desktop/src/features/sessions/new-session-card/*` | New agent in the picker; provider selection not required (follow the codex provider-optional precedent) |
| i18n (if new `t()` calls) | `pnpm --filter @cocurdex/desktop i18n:extract` → fill en-US / zh-CN → `pnpm --filter @cocurdex/desktop i18n:types` |

Not changed: `provider-service` / preload / IPC (no account flow); other adapters.

## Implementation order

1. **Task 0**: empirically verify print-mode permission behavior and re-check `agy --help` for flag drift (record findings in adapter comments).
2. Contracts + registry (`AgentId`, executable name, descriptor). Typecheck; fix every `switch`/`Record` over `AgentId` that the compiler flags — exhaustiveness will reveal all UI/runtime touchpoints.
3. `antigravity-print-output.ts` with tests (RED → GREEN): success result, non-SUCCESS status, garbage stdout, noise-prefixed stdout, auth-failure hint.
4. Adapter: spawn/args/kill, conversation-id persistence via `providerSession`, availability detection.
5. Daemon switch case + barrel exports.
6. Desktop session picker + i18n.
7. Verification (below).

## Verification

- Unit tests: `pnpm --filter @cocurdex/agent-adapters test`.
- Typecheck changed packages; `pnpm exec biome check --write <changed files>`.
- Manual (performed by the user, `agy` installed and signed in): create an Antigravity session → send a prompt → verify the response renders and turn stats show usage; send a second prompt → verify it resumes the same conversation (`agy` remembers context); stop mid-turn; quit/reopen the app and continue the session; rename the `agy` binary temporarily → verify the "missing binary" hint.

## Out of scope (v2 candidates)

- Streaming/tool events: would require the Antigravity SDK or an undocumented protocol; re-evaluate when Google documents a stream format for print mode (watch the changelog).
- Per-tool interactive approval, plan mode, `--json-schema` structured outputs, model picker, `--sandbox`-based fine-grained modes beyond the v1 mapping.
