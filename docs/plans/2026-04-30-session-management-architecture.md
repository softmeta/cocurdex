# Session Management Architecture

> Status: Planned | Date: 2026-04-30
> Goal: Make the desktop app the source of truth for session history while
> keeping provider-native session state as an optional resume optimization.

---

## 1. Summary

The app should own product-level session state. Agent adapters should own only
runtime handles and provider-specific resume hints.

- The desktop app is the only source of truth for `sessions`, `messages`,
  tool-call history, and editor restoration state.
- Each adapter may persist provider-native session metadata such as a Codex
  `threadId`, but that metadata is optional and disposable.
- Cold start should restore app history only. Agent runtimes should be created
  lazily when the user sends the next message.
- If provider resume fails, the app should automatically rebuild context from
  the persisted transcript and continue the turn.

This keeps the UX stable across provider changes, adapter rewrites, and
provider-side session expiration.

## 2. Why This Model Fits the Current Codebase

The repository already has an app-owned session model, but it is only partially
implemented.

- Shared app records already exist in
  `packages/shared/src/contracts.ts`:
  - `SessionRecord`
  - `MessageRecord`
  - `AgentEvent`
- The DB schema already defines:
  - `sessions`
  - `messages`
  - `editor_views`
- The Electron runtime still keeps provider session state in memory only:
  - `apps/desktop/electron/agent-runtime.ts`
  - `packages/agent-adapters/src/codex-adapter.ts`
  - `packages/agent-adapters/src/claude-code-adapter.ts`
- Startup restoration is not wired yet because `app:bootstrap` currently
  returns empty arrays in `apps/desktop/electron/main.ts`.

Because the app already has session IDs, message records, and storage schema,
the correct move is to finish app ownership instead of delegating product-level
history to each provider.

## 3. Ownership Rules

### 3.1 App-owned canonical state

The following data must be owned and persisted by the app:

- session identity and metadata
- workspace association
- session status visible in the UI
- write mode
- full user and assistant transcript
- system and error messages shown to the user
- persisted tool-call history if restart-safe timelines are required
- editor view restoration state
- last activity timestamps used for sorting and restoration

The app transcript is the source of truth for all user-facing behavior:

- sidebar rendering
- chat history
- session sorting
- restore after restart
- export or future sync
- provider fallback and replay

### 3.2 Adapter-owned runtime state

The following data should remain in memory and should not be treated as durable
history:

- active adapter instance
- current stream buffers
- abort controller
- active turn ID
- current process handles or subscriptions

This stays in `agent-runtime.ts` and inside the active adapter session object.

### 3.3 Provider-owned optional state

Provider-native session references may be persisted, but only as optional resume
hints:

- Codex `threadId`
- future Claude-native resumable session ID if available
- provider-specific feature flags or compatibility metadata

If this state is missing, stale, or invalid, the app session must still work by
replaying the app transcript into a fresh provider session.

## 4. Data Model Changes

Keep the existing app-level tables as the canonical layer:

- `workspaces`
- `sessions`
- `messages`
- `editor_views`

Add one provider-session table keyed by app `session_id`.

### 4.1 New table

Suggested table:

```sql
CREATE TABLE IF NOT EXISTS agent_provider_sessions (
  session_id TEXT PRIMARY KEY,
  provider_session_id TEXT,
  provider_state_json TEXT NOT NULL,
  provider_version TEXT,
  resumable INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### 4.2 Stored fields

- `session_id`
  - app-owned canonical session ID
- `provider_session_id`
  - provider-native ID such as Codex `threadId`
- `provider_state_json`
  - adapter-specific resumable metadata
- `provider_version`
  - adapter or provider version used to validate compatibility
- `resumable`
  - whether the adapter believes this provider state is worth trying
- `updated_at`
  - last successful provider-state update timestamp

### 4.3 Shared contracts

Add a shared type such as:

```ts
export interface AgentProviderSessionRecord {
  sessionId: string;
  providerSessionId: string | null;
  providerStateJson: string;
  providerVersion: string | null;
  resumable: boolean;
  updatedAt: string;
}
```

Do not add provider-specific fields directly onto `SessionRecord` or
`MessageRecord`.

## 5. Runtime and Persistence Flow

### 5.1 Bootstrap

Wire `app:bootstrap` to the DB and return persisted data instead of empty
collections.

Bootstrap should restore:

- workspaces
- sessions
- messages
- editor view state

Bootstrap should not restore:

- live agent runtime instances
- active streams
- in-progress provider turns

Any session that was previously `running` should be normalized back to `idle`
on startup.

### 5.2 Session creation

On `session:create`:

1. Persist the `SessionRecord`
2. Do not create a provider-native session yet
3. Do not create a runtime unless a send requires it

This keeps empty sessions cheap and avoids creating provider resources for
drafts that the user never uses.

### 5.3 Sending a message

On `session:sendMessage`:

1. Persist the user message immediately
2. Mark the session as `running`
3. Load provider session metadata if it exists
4. Lazily create or resume the adapter runtime
5. Stream provider events into app events
6. Persist assistant completed messages and tool-call updates
7. Persist the latest provider-session metadata when it changes
8. Mark the session back to `idle` or `error`

The renderer should no longer be the only holder of message history. The DB
must be updated from the main process event pipeline as the canonical write
path.

### 5.4 Stop behavior

`session:stop` should stop only the live runtime. It should not delete app
session history or provider-session metadata.

## 6. Resume and Fallback Policy

### 6.1 Resume order

When the user sends a new message:

1. Load the app session and full persisted transcript
2. If resumable provider metadata exists, try provider-native resume first
3. If provider resume succeeds, continue normally
4. If provider resume fails:
   - mark the provider metadata stale or non-resumable
   - create a new provider session
   - replay the app transcript into the new provider session
   - execute the pending user turn automatically

The user should not need to confirm this fallback. It should happen
automatically.

### 6.2 Replay source

Replay must use persisted app messages, not renderer atoms or transient
streaming buffers.

### 6.3 Adapter responsibility

The app should own the policy, but each adapter should own its replay mapping.

Examples:

- Codex adapter decides how to recreate a thread from transcript messages
- Claude adapter decides how to reconstruct prompt history if native resume is
  unavailable or invalid

The shared contract should let adapters distinguish:

- resume succeeded
- resume not possible
- resume failed and should trigger rebuild

## 7. Interface Changes

### 7.1 Repository layer

Add repository interfaces for:

- provider-session persistence
- bootstrap message loading
- optional persisted tool-call history

### 7.2 Agent adapter contract

Extend adapter/session APIs so the main process can:

- pass in existing provider-session metadata
- receive updated provider-session metadata from the adapter
- distinguish normal turn errors from resume failures

Suggested direction:

```ts
interface CreateAgentSessionPayload {
  session: SessionRecord;
  workspaceRootPath: string;
  providerSession?: AgentProviderSessionRecord | null;
}
```

And adapter-emitted updates should include a dedicated provider-state change
event or callback payload.

### 7.3 Event persistence

Persist at least these event outcomes in the main process:

- `message.completed`
- `state.changed`
- `error`
- tool-call start and finish if tool-call history must survive restart

Streaming deltas may remain transient UI updates and do not need to be stored as
independent records if final completed messages are persisted reliably.

## 8. Implementation Sequence

### Step 1: Finish app-owned persistence

- Wire DB repositories into Electron main
- Make `app:bootstrap` return real data
- Persist `sessions` and `messages` from the main process
- Normalize stale `running` sessions on startup

### Step 2: Add provider-session persistence

- Extend schema
- add repository
- add shared contract
- load and save provider-session metadata in the main process

### Step 3: Extend adapter interfaces

- pass provider metadata into adapter session creation
- surface provider metadata updates back to the main process
- add explicit resume failure signaling

### Step 4: Implement replay fallback

- build transcript replay from persisted `MessageRecord[]`
- implement Codex replay first
- define a no-surprises fallback path when provider resume fails

### Step 5: Optional restart-safe tool timeline

- decide whether tool calls should persist across restart
- if yes, add storage and bootstrap for tool-call records using the same
  ownership model as messages

## 9. Test Plan

Required tests:

- bootstrap restores persisted workspaces, sessions, messages, and editor state
- creating a session persists it before any runtime is required
- sending a message persists the user message even if provider execution fails
- assistant completed messages persist and reappear after restart
- previously `running` sessions become `idle` after cold start
- valid provider-session metadata is used on the next send
- invalid provider-session metadata triggers automatic transcript rebuild
- transcript replay works without renderer memory state
- stopping a session interrupts runtime only and does not delete persisted state

## 10. Defaults and Assumptions

Chosen defaults for this plan:

- app-owned transcript is the only source of truth
- provider-native session state is an optimization cache
- cold start restores history only, not live provider execution
- provider resume failure triggers automatic rebuild without prompting the user
- provider-specific metadata stays out of `SessionRecord`

Open implementation choice intentionally left narrow:

- tool-call persistence may be added now or immediately after message/session
  persistence, but if deferred it must remain explicitly non-canonical and be
  documented as restart-ephemeral

