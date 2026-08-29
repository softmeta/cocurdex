# Multi-Agent Plan Mode

> Status: Planned | Date: 2026-05-02
> Goal: Add session-level Plan Mode for Codex, Claude Code, and OpenCode.

## 1. Summary

The desktop app should support Plan Mode as a session-level collaboration mode
for Codex, Claude Code, and OpenCode. Users can choose Default or Plan when
starting a session, and non-running sessions can switch modes at any time.

The app should persist the selected mode in its app-owned session model as the
mode for the next turn. Switching modes does not rewrite earlier messages or
provider history. Each adapter should map the current mode to the strongest
provider-supported planning mechanism available:

- Codex uses native app-server `turn/start.collaborationMode`.
- Claude Code uses SDK `permissionMode: "plan"`.
- OpenCode uses prompt/system/tool controls in v1, with a later path to native
  configured OpenCode modes.

Plan Mode is not a filesystem permission mode. The existing `writeMode` field
continues to control read/write sandbox behavior.

## 2. Shared Contract

Add a shared collaboration mode type in `packages/shared/src/contracts.ts`:

```ts
export type CollaborationModeKind = "default" | "plan";
```

Extend `SessionRecord` with:

```ts
collaborationMode: CollaborationModeKind;
```

Extend agent capabilities with:

```ts
collaborationModes: CollaborationModeKind[];
```

Capability defaults:

- Codex: `["default", "plan"]`
- Claude Code: `["default", "plan"]`
- OpenCode: `["default", "plan"]`
- Pi: `["default"]`

## 3. Persistence

Extend the `sessions` table with:

```sql
collaboration_mode TEXT NOT NULL DEFAULT 'default'
```

Because existing app databases may not have this column, add a lightweight
startup migration in the SQLite layer:

- inspect `PRAGMA table_info(sessions)`
- add the column if missing
- map missing or invalid values to `default` in the row mapper

The app should keep old sessions usable without requiring users to reset their
local database.

## 4. Session State and UI

In the session store:

- create new sessions with `collaborationMode: "default"`
- allow creating Codex, Claude Code, and OpenCode sessions directly in `plan`
- allow mode changes whenever a session is idle, even after messages exist
- treat the stored mode as the mode for the next turn and future turns
- reset to `default` only when switching to an agent that does not support Plan
  Mode

In the new-session and chat composer UI:

- add a compact Default/Plan control beside the agent selector
- show Plan only when the selected agent supports it
- disable mode changes only while a session is running
- keep labels short and localize them in English and Chinese

The mode is session-level. Sending a message in Plan Mode does not
automatically switch the session back to Default. Switching modes affects only
subsequent turns; previous turns keep their original behavior and transcript.

## 5. Adapter Behavior

### 5.1 Codex

Extend the app-server client types just enough for the native collaboration mode
payload:

```ts
type CodexCollaborationMode = {
  mode: "default" | "plan";
  settings: {
    model: string;
    reasoning_effort: null;
    developer_instructions: null;
  };
};
```

When calling `turn/start`, pass:

```ts
collaborationMode: {
  mode: payload.session.collaborationMode,
  settings: {
    model: "",
    reasoning_effort: null,
    developer_instructions: null,
  },
}
```

Keep the existing sandbox and approval behavior:

- `writeMode: "read-only"` still maps to read-only sandboxing
- `writeMode: "native-write"` still maps to workspace-write sandboxing
- `approvalPolicy` remains `on-request`

### 5.2 Claude Code

When `collaborationMode === "plan"`, call `query()` with:

```ts
permissionMode: "plan"
```

Optionally pass `planModeInstructions` with the app's planning workflow so the
response shape is consistent with the desktop app. In Default mode, keep the
existing permission behavior from `mapWriteMode(writeMode)`.

Claude Code has native plan-mode enforcement through the SDK, so do not emulate
it by only prepending user prompt text.

### 5.3 OpenCode

The current adapter sends turns through `session.promptAsync`. In v1, when
`collaborationMode === "plan"`, pass a plan-specific `system` instruction and
restrict write-oriented tools in the request body.

The OpenCode SDK exposes configured modes, including `plan` in normal OpenCode
configurations. A later refinement can query available modes and prefer the
native configured `plan` mode when the adapter has a clean runtime path for it.
Until then, v1 should keep behavior explicit and local to the prompt request.

## 6. Plan Events and Rendering

Codex exposes native structured plan events. Add app-level plan events for
those updates:

- map `turn/plan/updated` to a shared `plan.updated` agent event
- store the latest plan per session in a renderer-side plan store
- render the plan in the active conversation as an assistant-side panel

The panel should display:

- optional explanation
- ordered plan steps
- each step status

For v1, use complete `turn/plan/updated` notifications as the source of truth.
`item/plan/delta` can be ignored initially or added later for smoother
streaming.

Claude Code and OpenCode do not need structured plan panels in v1. Their final
assistant output should render as normal chat text.

## 7. Tests

Add tests for:

- session creation and idle-session updates preserving `collaborationMode`
- switching modes after existing messages affects the next turn payload only
- SQLite compatibility when the `collaboration_mode` column is missing
- agent capabilities advertising Plan Mode for Codex, Claude Code, and OpenCode
- Codex `turn/start` receiving the correct `collaborationMode` payload
- Claude Code using `permissionMode: "plan"` in Plan Mode
- OpenCode passing plan `system` instructions and tool restrictions in Plan Mode
- renderer plan store upserting Codex `plan.updated` events
- UI mode selection on new and existing idle sessions
- disabled mode switching while a session is running

After implementation, run:

```sh
pnpm --filter @cocurdex/desktop exec tsc --noEmit
pnpm exec biome check --write apps/desktop/src
```

Do not run `pnpm --filter @cocurdex/desktop dev`; ask the user to run it
manually.

## 8. Assumptions

- Plan Mode is session-level, not per-message.
- Users can switch modes during an existing conversation when the session is
  idle; the change applies to the next turn and does not mutate prior history.
- Codex is the only v1 provider with structured plan events in the app
  timeline.
- Claude Code's native `permissionMode: "plan"` is preferred over prompt-only
  instructions.
- OpenCode v1 uses prompt/system/tool controls because the current adapter path
  uses `session.promptAsync`; native configured modes can be adopted later.
- Plan data is renderer runtime state in v1 and is not persisted to the
  database.
- The final assistant message remains the normal chat transcript. Plan panels
  are auxiliary timeline state, similar to tool calls and permission cards.
