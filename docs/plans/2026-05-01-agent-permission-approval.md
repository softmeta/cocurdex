# Agent Permission Approval

> Status: Planned | Date: 2026-05-01
> Goal: Add a user-confirmation flow when agents request permission to run
> sensitive operations.

## 1. Summary

The desktop app should own a unified permission approval flow across Codex,
Claude Code, and OpenCode.

When an agent requests permission for a command, file change, external path, or
similar sensitive operation, the adapter should pause and ask the Electron main
process for a user decision. The renderer should show a pending permission card
in chat. The user can allow or deny the request. Pending requests do not time
out; they wait until the user responds or stops the session.

## 2. Shared Contract

Add a shared permission request model in `packages/shared/src/contracts.ts`.

New records and events:

- `AgentPermissionRequestRecord`
- `AgentPermissionRequestedEvent`
- `AgentPermissionResolvedEvent`
- `AgentPermissionDecision`

Each request should include:

- request id
- session id
- provider id
- permission kind
- title and optional description
- raw provider input
- related file locations when available
- status: pending, allowed, denied
- created and updated timestamps

Extend `AgentEvent` with permission requested and resolved events.

## 3. Runtime Flow

Add `requestPermission(request): Promise<AgentPermissionDecision>` to
`CreateAgentSessionPayload`.

In `apps/desktop/electron/agent-runtime.ts`:

- keep a map of pending permission resolvers
- emit `permission.requested` to all renderer windows
- expose a resolver used by adapters
- clean up pending requests on session stop or runtime disposal

In Electron IPC:

- add `permission:resolve`
- expose it through `preload.ts`
- add `desktopApi.resolvePermission(requestId, decision)` to renderer types

## 4. Provider Integration

Codex:

- stop auto-denying app-server approval requests
- route `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `execCommandApproval`, and
  `applyPatchApproval` through the shared permission callback
- change the turn approval policy so app-server can request approval
- map allow and deny back to the provider-specific response shapes

Claude Code:

- use the SDK `canUseTool` callback
- map `title`, `displayName`, `description`, `blockedPath`, `toolUseID`, and
  input into the shared permission request
- return allow or deny from the user decision
- avoid silently pre-authorizing write operations in `native-write`

OpenCode:

- listen for `permission.updated`
- show it as a shared pending permission request
- call `postSessionIdPermissionsPermissionId`
- map allow to `once` and deny to `reject`
- consume `permission.replied` to update resolved UI state

## 5. UI

Add a permission store beside the existing tool-call store.

The chat timeline should render a permission request card with:

- provider-supplied title
- command, file, diff, or raw input details
- Allow and Deny buttons while pending
- resolved state after the user responds

Add English and Chinese strings in chat locale files.

## 6. Tests

Add tests for:

- Codex approval requests calling the permission resolver
- Codex provider response mapping
- Claude `canUseTool` allow and deny mapping
- OpenCode `permission.updated` and `permission.replied`
- renderer permission store updates
- UI button behavior and IPC call

After implementation, run:

```sh
pnpm --filter @cocurdex/desktop exec tsc --noEmit
pnpm exec biome check --write apps/desktop/src
```

Do not run `pnpm --filter @cocurdex/desktop dev`; ask the user to run it
manually.

## 7. Assumptions

- First version only supports one-time Allow and Deny.
- Permission requests are runtime state and are not persisted to the database.
- Pending requests wait indefinitely until the user responds or stops the
  session.
- Stopping a session denies and clears all pending permission requests for that
  session.
