# Pi as Cocurdex Default Agent Runtime Plan

## Summary

Cocurdex should treat Pi as the built-in default agent runtime. Users should be able to install Cocurdex, configure a provider and model in Cocurdex settings, and immediately use Pi agent capabilities without installing or configuring their own global Pi setup.

Pi SDK `AgentSession` is the primary runtime path because it owns agent lifecycle, message history, model state, compaction, event streaming, tools, and extensions. The RPC adapter remains only as a fallback/debug path.

Cocurdex-owned Pi auth, model config, and sessions must live under the Cocurdex app data directory and must not read, migrate, or modify the user's own `~/.pi/agent`.

## Completed

- Added a Pi SDK adapter as the main Pi runtime entry.
- Kept the Pi RPC adapter as fallback for `pi-cli` and debug paths.
- Isolated Pi runtime files under `<userData>/pi-agent`.
- Added provider runtime support for:
  - `openai-compatible`
  - `openai-responses`
  - `anthropic-compatible`
  - `google-generative-ai`
  - `pi-cli`
- Changed Pi provider/model listing to use Cocurdex provider configs instead of Pi CLI models.
- Reused the same provider registry for Agent mode and Chat mode.
- Added first-pass provider UI sections:
  - Provider
  - Auth
  - Models
  - Advanced
- Fixed Electron ESM path resolution so `dev:inspect` creates the main window.

## Remaining Work

> Status (2026-07-01): All planned work is complete. Provider templates shipped and the storage audit is done (see below). Nothing outstanding.

### Outstanding

- None.

### Provider Schema

- [x] Add Pi-native provider fields: `api`, `compatJson`.
- [x] Add Pi-native model fields: `capabilities`, `reasoning`, `thinkingLevelMapJson`, `costJson`, `compatJson`.
- [x] Add SQLite migrations for the new provider/model columns (migration v11).
- [x] Keep `runtime` for Cocurdex compatibility filtering and Chat runtime mapping.
- [x] Prefer provider `api` when building Pi SDK provider config, falling back to `runtime`.

### Pi SDK Adapter (done)

- [x] Pass provider `api`, headers into `registerProvider`; model compat falls back to provider compat (SDK has no provider-level compat slot).
- [x] Pass model `contextWindow`, `maxTokens`, `reasoning`, `thinkingLevelMap`, `cost`, input capabilities, and compat into Pi model registration.
- [x] Snapshot builder (`use-new-session-card`) and daemon `buildRuntimeProviderConfig` plumb the new fields end-to-end.

### Picker Behavior (done)

- [x] Agent picker filters by `agent` capability (or no explicit capabilities) via `isAgentCapableModel`.
- [x] Chat picker filters by `chat` capability + `isChatSupportedRuntime` (pi-cli excluded).
- [x] Disabled providers/models stay hidden.

### Provider UI

- [x] Expose Pi provider API selection in Provider section (Auto/runtime fallback).
- [x] Expose provider-level compat JSON in Advanced.
- [x] Expose model capabilities (`agent`, `chat`, `vision`, `reasoning`).
- [x] Expose model reasoning toggle.
- [x] Expose thinking level map JSON.
- [x] Expose model cost JSON.
- [x] Expose model-level compat JSON.
- [x] Add templates for common providers (`provider-templates.ts`, shown as a
  searchable picker in the new-provider flow):
  - Anthropic
  - OpenAI
  - Google Gemini
  - OpenRouter
  - DeepSeek
  - Kimi (Moonshot)
  - Cloudflare AI Gateway
  - Cloudflare Workers AI
  - Azure OpenAI
  - local OpenAI-compatible
  - _Excluded:_ Amazon Bedrock (SigV4/AWS creds) and Google Vertex (ADC) need
    non-API-key auth and a Bedrock-specific API that is not one of Cocurdex's
    four `ProviderApi` dialects, so they cannot be represented as a
    `{baseUrl, api, apiKey}` template this phase.

Auth note: API-key auth stays the only supported path; no subscription OAuth login flow this phase.

### Storage (audited 2026-07-01 — confirmed)

- Pi native session files remain the source of truth under `<userData>/pi-agent/sessions`.
- Cocurdex SQLite stores exactly the intended surface, verified against the live
  Pi SDK adapter (`pi-sdk-adapter.ts`) and `packages/db/src/schema.ts`:
  - session index / workspace / title / status (`sessions`)
  - selected provider/model snapshot (`sessions.provider_snapshot` + `provider_configs`/`provider_models`)
  - Pi session id + file pointer (`agent_provider_sessions.provider_state_json`
    holds only `JSON.stringify({ sessionFile })` — a path pointer, not tree data)
  - flat UI transcript mirror (`messages`: role/kind/content text; `tool_calls`:
    title/status/raw input+output for display)
- Confirmed **no** duplication of Pi's internal message tree: the adapter emits
  UI-shaped `MessageRecord`/`AgentToolCallRecord` events (concatenated text, flat
  rows), never the structured Pi content-block tree, which stays in the session
  file.

## Verification

- `pnpm --filter @cocurdex/agent-adapters exec vitest`
- `pnpm --filter @cocurdex/agent-adapters exec tsc`
- `pnpm --filter @cocurdex/shared exec vitest`
- `pnpm --filter @cocurdex/shared exec tsc`
- `pnpm --filter @cocurdex/llm-chat exec vitest`
- `pnpm --filter @cocurdex/llm-chat exec tsc`
- `pnpm --filter @cocurdex/db exec vitest`
- `pnpm --filter @cocurdex/db exec tsc`
- `pnpm --filter @cocurdex/desktop exec vitest`
- `pnpm --filter @cocurdex/desktop exec tsc`
- `pnpm exec biome check --write <changed files>`
- If i18n changes:
  - `pnpm --filter @cocurdex/desktop i18n:extract`
  - `pnpm --filter @cocurdex/desktop i18n:types`
