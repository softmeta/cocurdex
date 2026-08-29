# Claude Dual-Channel Integration: Agent SDK (API key) + Local Claude CLI (headless)

Status: approved plan, not yet implemented.
Executor: any coding agent (written to be self-contained; verify file/line references against the current tree before editing).

## Context

Cocurdex needs two ways to run the Claude agent:

1. **Agent SDK + API key** — already implemented and compliant. `packages/agent-adapters/src/claude-code/` drives Claude via `@anthropic-ai/claude-agent-sdk`. Auth flows through the provider system: `buildRuntimeProviderConfig` (in `apps/desktop/electron/provider/provider-service.ts`) resolves the stored secret into `RuntimeProviderConfig.apiKey`, and `createClaudeProviderEnv` (in `claude-code-adapter.ts`) injects `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` into the SDK child env while scrubbing the user's own `ANTHROPIC_*` vars. `settingSources` is locked to `["project"]` so the user's `~/.claude` config never leaks in. **No new work here** — regression-verify only (see Verification).
2. **Local Claude CLI (`claude -p` headless)** — new feature. Lets the user run sessions on their own installed, own-authenticated (subscription) `claude` CLI.

### Hard policy constraint (drives the architecture)

Anthropic policy: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead."*

Consequences for the local-CLI mode:

- Do NOT go through `@anthropic-ai/claude-agent-sdk`. Spawn the user's own `claude` binary directly.
- The app must never handle, initiate, or proxy any claude.ai login or credentials. If the binary is missing or unauthenticated, show a message telling the user to install / run `claude login` in their own terminal.
- Do NOT pass `--bare`: bare mode skips OAuth and keychain reads, which would break the user's subscription auth.

## Design decisions

### New standalone agent id: `claude-agent`

Do not bolt an auth toggle onto `claude-code`. The two modes differ in binary source, auth model, provider dependency (local CLI needs no provider), and capability set — and the policy above requires a clean separation from the SDK path.

Precedent: `codex` is already a "provider-optional" agent (needs no API-key provider when in ChatGPT-login state), so the UI and runtime already support this shape.

### Process model: one spawn per turn + `--resume`

No long-lived process pool (unlike codex's app-server pool). `claude -p` is a one-shot process; multi-turn continuity uses `--resume <session_id>`.

```
claude -p
  --output-format stream-json --verbose --include-partial-messages
  [--resume <sessionId>]           # from the second turn onward
  [--model <modelId>]              # only if the user picked a model in the UI; otherwise CLI default
  [--permission-mode <mapped>]     # see permission table below
```

- Prompt delivery: pass the user message on stdin (avoids argv length/quoting issues; attachments/text helpers already exist in `claude-code-utils.ts`).
- `cwd` = `payload.workspaceRootPath`.
- `env` = sanitized passthrough of `process.env`. Do NOT inject or delete `ANTHROPIC_*` — the CLI must use the user's own credentials.
- Capture `session_id` from the stream-json `system:init` (and `result`) events; persist via `payload.onProviderSessionUpdate` into the existing `AgentProviderSessionRecord` (`packages/shared/src/contracts.ts`); pass `--resume` on the next turn.
- `stop()` / `dispose()`: kill the child process. The headless 5-second background-bash grace period needs no special handling.

### Permission model (v1: mode mapping, no per-tool approval)

Map the app's permission mode to a CLI flag (follow the existing patterns in `packages/agent-adapters/src/shared/` permission mapping):

| App mode | CLI flag |
|---|---|
| plan | `--permission-mode plan` |
| read-only | `--permission-mode dontAsk` |
| accept-edits | `--permission-mode acceptEdits` |
| bypass | `--permission-mode bypassPermissions` |

v1 limitation (document in a code comment and in the adapter's capability declaration): local-CLI mode does not support mid-turn interactive tool approval — the SDK's `canUseTool` control protocol over stream-json is not publicly documented. A denied tool aborts that turn. Interactive approval remains available in the SDK/API-key mode.

v2 (optional, out of scope): implement the stream-json control protocol (`can_use_tool` control_request/control_response); validate stability against CLI versions first.

### Output parsing: NDJSON → AgentEvent

New pure-function module `claude-stream-json.ts`: parse stream-json lines and map them to `AgentEvent`s (`message.delta`, `message.completed`, `tool.started`, `tool.finished`, `turn.completed`, `error` — see `packages/agent-core/src/agent-events.ts`).

The CLI's stream-json event shapes match the SDK's `SDKMessage` types (the SDK speaks this same protocol under the hood). Therefore: **extract the existing message→event mapping logic from `claude-code-adapter.ts`** (`extractTextDelta`, tool_use/tool_result mapping, assistant-message flush) **into a shared module** (e.g. `packages/agent-adapters/src/claude-shared/`) reused by both adapters. Do not copy-paste.

Error mapping: `result` error subtypes and `system/api_retry` error categories (`authentication_failed`, `billing_error`, `rate_limit`, …) → `error` AgentEvent. For `authentication_failed`, attach a hint telling the user to run `claude login` in their terminal.

### Detection and availability

- `packages/agent-core/src/agent-registry.ts`: add `"claude-agent": "claude"` to `agentExecutableNames` and a new entry to the hardcoded `descriptors[]`. The existing `detectAgentInstallations` (`which`/`where.exe` via `agent-installation.ts`) then reports available/missing automatically.
- Binary path resolution: reuse the `which claude` branch of `resolveClaudeBinary()` in `claude-code-utils.ts`. IMPORTANT: skip its `require.resolve` branch that finds the SDK's bundled platform packages (`@anthropic-ai/claude-agent-sdk-darwin-arm64`, …) — this mode must use the user's own installation, never the SDK-bundled binary.

## Files to change

| File | Change |
|---|---|
| `packages/shared/src/contracts.ts` | Add `"claude-agent"` to the `AgentId` union |
| `packages/agent-core/src/agent-registry.ts` | Descriptor + executable name |
| `packages/agent-adapters/src/claude-agent/claude-agent-adapter.ts` | New adapter: spawn, lifecycle, resume, permission mapping |
| `packages/agent-adapters/src/claude-agent/claude-stream-json.ts` (+ `.test.ts`) | Pure NDJSON parser, TDD |
| `packages/agent-adapters/src/claude-code/` (extraction) | Move message→AgentEvent mapping into a shared module (e.g. `src/claude-shared/`) used by both adapters |
| `packages/agent-adapters/src/index.ts` | Barrel export |
| `packages/daemon/src/runtime.ts` | Add case to the `createAgentAdapter` switch |
| `apps/desktop/src/features/sessions/new-session-card/*` | New agent in the picker; provider selection optional for this agent (follow the codex precedent) |
| i18n (if new `t()` calls) | `pnpm --filter @cocurdex/desktop i18n:extract` → fill en-US / zh-CN → `i18n:types` |

Not changed: `claude-code` adapter auth logic; `provider-service` (local-CLI mode needs no new IPC channels — there is no account flow).

## Implementation order

1. Contracts + registry (types first; whole chain compiles).
2. TDD: `claude-stream-json.test.ts` with real stream-json sample fixtures → implement the parser. (Fixtures: run `claude -p "hi" --output-format stream-json --verbose --include-partial-messages` locally and capture representative lines: `system:init`, `stream_event` text deltas, `assistant` with tool_use, `user` with tool_result, `result`, `system/api_retry`.)
3. Extract the claude-code shared mapping module; keep claude-code regression tests green.
4. `claude-agent-adapter.ts`: spawn / resume / stop / permission mapping / error mapping.
5. Wire daemon runtime + barrel.
6. UI: new-session-card supports the provider-optional agent; missing-state copy for install / `claude login` guidance.
7. Validate: typecheck the changed packages, `pnpm exec biome check --write <changed files>`, i18n flow if applicable.

## Verification

- Unit tests: `pnpm --filter @cocurdex/agent-adapters test` (new parser tests + claude-code regressions).
- Typecheck the changed packages.
- Manual (performed by the user, on a machine with `claude login` done): create a claude-agent session in the desktop app → verify streaming output, tool events, multi-turn resume, stop; then verify the missing-binary and unauthenticated hints; finally regression-run one conversation in the SDK + API-key mode.
