# TODO

## macOS 26 app icon

- [ ] Replace the legacy PNG/ICNS app icon with an Icon Composer `.icon`
      asset so macOS does not add the unwanted edge highlight around the
      Cocurdex mark in the app switcher. Group the background and mark, disable
      Specular, Shadow, and Refraction on the mark, then point
      `electron-builder`'s `mac.icon` to the new asset. Keep an ICNS file for
      the DMG volume icon and verify the result on macOS 26 at Cmd+Tab size.

## Codex account UI (backend already wired)

The ChatGPT-login backend for the built-in Codex agent is complete: pooled
`codex app-server` client, `readCodexAccount` / `startCodexChatGptLogin` /
`cancelCodexLogin` / `logoutCodex` in
`packages/agent-adapters/src/codex/codex-account.ts`, IPC channels
(`codex:accountRead|loginStart|loginWait|loginCancel|logout`) in
`apps/desktop/electron/provider/provider-service.ts`, and `desktopApi`
methods (`readCodexAccount`, `startCodexLogin`, `waitCodexLogin`,
`cancelCodexLogin`, `logoutCodex`). Only the UI remains.

- [ ] Add a `CodexAccountSection` to the providers settings panel
      (`apps/desktop/src/features/settings/providers/`): status line from
      `readCodexAccount()` (signed out / method `chatgpt` + email + planType /
      `apikey`), a "Sign in with ChatGPT" button (`startCodexLogin()` →
      `openExternal(authUrl)` → `waitCodexLogin(loginId)` → refresh state,
      spinner + cancel while pending), and a "Sign out" button
      (`logoutCodex()`).
- [ ] i18n: `i18n:extract`, fill en-US / zh-CN, `i18n:types`.
- [ ] Optional: `chatgptDeviceCode` flow for no-browser environments.

- [ ] Squash pre-release database migrations into a single baseline migration.
- [ ] Keep `createSchemaSql()` as the source of truth for fresh installs.
- [ ] Add the next migration only for schema changes made after the first public release.
- [ ] Document the database migration policy before release.

## Settings audit fixes (2026-07-06)

Findings from a settings-feature review. Fix priority: correctness → security
→ gaps → polish.

### Correctness

- [ ] Sync the two hue controls in `apps/desktop/src/features/settings/appearance-settings.tsx`.
      The slider writes `hsl(N 70% 52%)`, the color input writes `#rrggbb`;
      each reads the other's format as invalid and silently falls back
      (slider → 217, color input → `#3b82f6`). Store one canonical format
      (suggest hue number or hex) and derive both control values from it.
- [ ] Prevent provider-ID edits from forking records. In
      `provider-details-section.tsx` the ID field stays editable for existing
      non-preset providers; saving under a changed ID creates a new provider,
      leaves the old one, and strands its models. Disable the ID field once
      the provider exists (or implement a real rename that migrates models).
- [ ] Validate before save in `provider-settings.tsx` `saveProvider`:
      reject empty id/name/baseUrl (currently `saveProviderConfig("")` is
      possible). Same for `AddModelDialog`: reject empty `modelId`.
- [ ] Add confirmation dialogs for destructive actions: delete provider
      (`provider-details-section.tsx`) and delete model
      (`ModelParametersDialog` in `provider-models-section.tsx`) are
      single-click irreversible deletes.
- [ ] Add error handling to provider IPC mutations: `handleSaveProvider`,
      `removeProvider`, `saveModel`, `addModel`, `deleteModel` have no
      try/catch — a failed IPC call is an unhandled rejection with zero UI
      feedback. Mirror the pattern already used in `handleRefreshModels`.
- [ ] Validate JSON fields in `ModelParametersDialog` (`costJson`,
      `compatJson`, `thinkingLevelMapJson`) before save; bad JSON currently
      persists and then renders as "-" via silent `parseJsonRecord` failure.

### Security / privacy

- [ ] Stop persisting `headersJson` to localStorage. The first-paint snapshot
      in `provider-settings.tsx` serializes full provider records; custom
      headers commonly hold `Authorization` tokens, bypassing secret storage.
      Strip `headersJson` from the snapshot (or store only id/name/model
      counts needed for the card strip).

### Gaps

- [ ] Remove or wire up the 8 unreachable settings sections in
      `settings-screen.tsx` (`personalization`, `mcp`, `git`, `environment`,
      `workspace`, `computer`, `archived`, `usage`): the sidebar renders only
      `group === "core"`, everything else is a placeholder panel with no
      entry point. Delete dead config until the panels exist.
- [ ] Remember provider selection across reloads: `reload()` writes
      `providers[0]?.id` into the snapshot's `selectedProviderId` instead of
      the user's current selection, so reopening settings always lands on the
      first provider.

### Polish

- [ ] `CodePreview` in `appearance-settings.tsx` hardcodes dark colors
      (`bg-rose-950/35` + `text-rose-200`) — unreadable in light theme; also
      uses physical `mr-5` (RTL rule: use `me-5`).
- [ ] i18n missing strings: `"Search providers..."` placeholder in
      `provider-settings.tsx`, `"e.g. https://api.openai.com/v1"` in
      `provider-details-section.tsx`. Run `i18n:extract`, fill en-US/zh-CN,
      `i18n:types`.
- [ ] Project-convention violations: module-level className string constants
      (`providerTabClassName` etc. in `provider-settings.tsx`,
      `fieldClass`/`labelClass` in provider sections) — extract components
      instead; `SettingsGroup`/`SettingRow` duplicated across
      `settings-screen.tsx`, `appearance-settings.tsx` and
      `providers/settings-group.tsx` — consolidate to one shared copy.
- [ ] Disable `Stepper` +/- buttons at min/max in `appearance-settings.tsx`.

## Provider apis — maximize Pi support

Goal: support every Pi api, including special-auth modes. Add each api to the
single source `providerApis` in `packages/shared/src/contracts.ts` — type,
model-import filter, agent/chat compatibility and the manual-model picker all
derive from it.

- [ ] Add special-auth apis to `providerApis`: `bedrock-converse-stream`, `google-vertex`, `azure-openai-responses`, `openai-codex-responses`.
- [ ] Build the auth flows they need (AWS/GCP creds, Azure resource, Codex OAuth) — plain base URL + API key is not enough.
- [ ] Remove the now-supported providers from `excludedProviderIds` in `packages/agent-adapters/src/pi-sdk/pi-provider-catalog.ts` once their auth lands.
- [ ] Add matching `LlmProviderKind` cases in `packages/llm-chat/src/provider-kind.ts` for apis the chat feature should drive (e.g. a `mistral` kind instead of falling back to `openai-compatible`).

## Chat streaming — deferred optimizations

Follow-ups to the 2026-07-04 streaming pass (main-process delta coalescing,
multi-message transcript tail patch, loaded-map debounce). Each item was
deferred because the win only shows up under a condition we haven't hit yet;
pick it up when the trigger appears.

- [ ] Skip offscreen transcript rendering for long sessions.
      Trigger: scroll/resize jank once sessions reach hundreds of turns.
      Approach: add `content-visibility: auto` + `contain-intrinsic-size`
      (estimated row height) on the historical conversation-group containers
      rendered by `chat-view.tsx` — the browser then skips layout/paint for
      offscreen groups while keeping DOM and find-in-page intact. No virtual
      list library, no scroll-anchoring conflicts with the streaming
      auto-scroll (the streaming tail stays outside the historical list).
      Verify with the Performance panel: layout cost should stop growing with
      transcript length. Only reach for `@tanstack/react-virtual` if
      `content-visibility` proves insufficient (e.g. memory from mounted
      markdown DOM still hurts).

- [ ] Replace timestamp ordering with a per-session monotonic sequence.
      Trigger: a real mis-ordered transcript (live vs reload mismatch, or
      same-millisecond tie between a message and a tool call rendering in the
      wrong causal order).
      Approach: stamp `seq` (per-session increasing integer) at the single
      event choke point — `emitAgentEvent` in
      `apps/desktop/electron/chat/agent-runtime.ts`, not in each adapter —
      onto messages, tool calls, permissions and questions; persist it
      (`messages.seq`, `tool_calls.seq`, … in `packages/db/src/schema.ts`,
      fold into the pre-release baseline migration above instead of adding a
      migration); change the k-way-merge compare in
      `chat-timeline.ts` from `sortAt` string compare to `seq`, and the
      reload sort in `message-store.ts` likewise. Timestamps stay for
      display only. This makes live and reloaded order identical by
      construction.

- [ ] Reduce renderer delta flush cadence if streaming still costs too much.
      Trigger: profiler shows React commits during streaming remain a hot
      spot after the main-process coalescing.
      Approach: raise `DELTA_FLUSH_DELAY_MS` in
      `src/features/chat/view/message-store.ts` from 16 to 33 (30fps is
      indistinguishable for text streaming; halves store writes and commits).
      One-line change; measure before/after with React Profiler on a long
      streaming reply.

- [ ] Drop the captured jotai `get`/`set` from the delta flush timer.
      Trigger: flaky delta tests, or HMR/store-reset leaving a stale store
      reference (deltas applied to a dead store).
      Approach: `enqueueDelta`'s `setTimeout` closure captures `get`/`set`
      from the first atom write; instead hold the flush state per store —
      e.g. key `pendingDeltas`/timer by the store instance (WeakMap keyed on
      `get(storeIdentityAtom)` or move the buffer into an atom holding a
      mutable ref), so a rebuilt store never receives another store's
      buffered deltas.

## Claude Agent 成本可见度

会话中途切换模型会让整段上下文按全价重新计费：prompt cache 按模型分区，而
Claude Code 会话用的是 1 小时 TTL 且每次命中都会续期，所以长会话在用户去点
模型选择器时，缓存通常还是热的。

- [ ] 切换模型前提示 prompt cache 会失效。
      当选中的模型与当前模型不同时，在模型选择器内部显示一行
      `Text size="meta"`，说明会被重新计费的上下文规模。显示条件：上一轮结束
      时间仍在 cache TTL 窗口内，且 `contextTokensUsed` 已经不小；不满足则
      不显示。`contextTokensUsed` 已经由
      `packages/agent-adapters/src/claude-cli/claude-cli-adapter.ts` 中
      `emitContextUsage` 发出的 `usage.updated` 事件提供。
      不要拦截操作：不用 `Dialog`、不用 toast、不加确认步骤 —— 切换模型是高频
      操作，任何需要点掉的东西几天内就会被无视。
