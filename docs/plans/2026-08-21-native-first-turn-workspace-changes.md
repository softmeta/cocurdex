# Native-First Turn Workspace Changes

## Handoff Purpose

This document is an implementation handoff for adding per-turn workspace change summaries, review,
and safe file undo to Cocurdex.

The implementation must prefer reliable provider-native capabilities and use Git or filesystem
checkpoints only to fill coverage gaps, provide conflict detection, and support providers or file
types without native support.

## Goal

For each completed agent turn, display a workspace changes card associated with the assistant
message:

- changed file count;
- additions and deletions when meaningful;
- expandable file list;
- full review surface;
- safe file undo;
- support for both Git repositories and ordinary folders containing Markdown, documents,
  spreadsheets, images, and other binary files.

The feature must work across all currently registered adapters:

- `claude-agent`;
- `codex`;
- `grok-build`;
- `opencode`;
- `pi`.

## Non-Goals for the First Delivery

- Semantic DOCX paragraph diff.
- Semantic XLSX worksheet and cell diff.
- Pixel-level image diff.
- A universal conversation-history rollback contract.
- Perfect attribution when multiple agents or external applications modify the same shared folder
  concurrently.

The first delivery should still detect, list, review at a basic level, and safely restore binary
files byte-for-byte.

## Key Product Decisions

1. Provider-native capabilities are the preferred source when they are reliable.
2. Native data is evidence with an explicit coverage level, not automatically the complete
   workspace truth.
3. Git and filesystem checkpoints are fallback adapters behind one checkpoint seam.
4. The UI consumes one canonical `TurnChangeSet` and never branches on provider type.
5. File undo and conversation rollback are separate capabilities.
6. Undo must never silently overwrite changes made after the target turn.
7. A recovery checkpoint must be captured before any destructive restore.
8. Do not reuse the current Git discard operation for turn undo. It restores from `HEAD` and can
   destroy unrelated user changes.

## Current Adapter Registration

The concrete adapter factory is:

`packages/agent-adapters/src/agent-adapter-factory.ts`

It registers Claude Agent SDK, Codex app-server, Grok Build through ACP, OpenCode, and Pi.

The current common `AgentSession` interface in
`packages/agent-core/src/agent-types.ts` has no workspace change or file rewind capability.

The current `AgentToolCallRecord` in `packages/shared/src/contracts.ts` also has no turn or message
identifier. Do not model a complete turn change set as a synthetic tool call.

## Provider Capability Matrix

| Provider | Native change data | Native file rewind | Native coverage | Current Cocurdex gap |
| --- | --- | --- | --- | --- |
| Claude Agent SDK | Dry-run rewind returns file paths and aggregate insertions/deletions | Yes, `rewindFiles()` | Write, Edit, NotebookEdit only | Checkpointing is not enabled or exposed |
| Codex app-server | Full turn-level unified diff stream | No | Committed `apply_patch` mutations | `turn/diff/updated` is not consumed |
| OpenCode | Message/session diff with patch and stats | No confirmed native rewind | OpenCode-recorded changes | `session.diff` is accepted but not handled |
| Grok Build / ACP | Per-tool old/new diff content | No ACP rewind contract | Provider-emitted edit tool calls | Diff is mapped but not aggregated by turn |
| Pi | Edit tool unified patch | No | Pi Edit tool calls | Patch remains in raw output |

## Claude Agent SDK Integration

The installed dependency is `@anthropic-ai/claude-agent-sdk` `^0.3.221`.

It supports:

```ts
enableFileCheckpointing: true;
query.rewindFiles(userMessageId, { dryRun: true });
query.rewindFiles(userMessageId);
```

The dry-run result can contain:

```ts
type RewindFilesResult = {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
  skippedLinks?: number;
};
```

Relevant local definitions:

- `node_modules/.../@anthropic-ai/claude-agent-sdk/sdk.d.ts`, around
  `enableFileCheckpointing` and `rewindFiles`;
- `packages/agent-adapters/src/claude-cli/claude-cli-adapter.ts` already assigns the Cocurdex user
  message ID as the SDK user message UUID.

Official documentation:

<https://code.claude.com/docs/en/agent-sdk/file-checkpointing>

Required implementation:

1. Enable file checkpointing in the Claude query options.
2. Keep the user message UUID as the native checkpoint reference.
3. After turn completion, call native dry-run rewind to obtain the native file summary.
4. Normalize the result as native workspace change evidence.
5. Expose native rewind through the internal workspace change seam.
6. Before a real native rewind, run Cocurdex conflict checks and capture a recovery checkpoint.

Do not overstate native coverage. Claude checkpointing does not cover:

- Bash modifications;
- most subagent modifications;
- directory creation, movement, or deletion;
- remote or network files;
- arbitrary MCP-based document, spreadsheet, or image modifications.

## Codex App-Server Integration

Codex app-server emits:

```text
turn/diff/updated { threadId, turnId, diff }
```

`diff` is the latest aggregated unified diff for the turn. Relevant upstream
source is the Codex app-server protocol (`turn/diff/updated`) and
`TurnDiffTracker`.

Required implementation:

1. Add the notification type to Cocurdex Codex app-server event types.
2. Consume `turn/diff/updated` in the Codex adapter.
3. Emit canonical native turn-diff evidence keyed by Codex `turnId`.
4. Persist the latest snapshot, replacing the previous diff snapshot for the same turn.
5. Parse the final unified diff for file summaries and review.

Important limitations:

- `TurnDiffTracker` only tracks committed `apply_patch` mutations.
- Bash and external process writes may not be represented.
- Codex `thread/revert` and deprecated `thread/rollback` affect conversation history; they do not
  restore local files.

Use the Codex native diff as the primary Review source, but use a host checkpoint for complete
coverage and safe undo.

## OpenCode Integration

The installed OpenCode SDK exposes `SnapshotFileDiff` with:

```ts
type SnapshotFileDiff = {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status?: string;
};
```

It also supports session diff queries with an optional `messageID`.

Required implementation:

1. Handle `session.diff` instead of only allowing it through session adoption filtering.
2. Prefer a message-scoped diff when the provider message identifier is available.
3. Normalize provider file status, patch, additions, and deletions.
4. Use native data as the primary Review source.
5. Use a host checkpoint for file undo.

## Grok Build / ACP Integration

The ACP mapper already supports:

```ts
{
  type: "diff";
  path: string;
  oldText?: string;
  newText: string;
}
```

Grok Build emits ACP diff content from its shell conversion layer.

Required implementation:

1. Preserve the existing tool-level mapping.
2. Associate tool evidence with the active turn/message.
3. Aggregate repeated edits to the same path into a net turn change where possible.
4. Treat ACP diff content as optional.
5. Use the host checkpoint as final coverage and undo authority.

## Pi Integration

Pi Edit results include a standard unified patch in `details.patch`.

Required implementation:

1. Extract the patch from the completed Edit tool result.
2. Normalize it as tool-level native evidence.
3. Associate it with the active turn/message.
4. Use host checkpoint coverage for Write, Bash, and other modifications.

## Canonical Model

Add a dedicated persisted turn change model rather than extending tool calls:

```ts
type WorkspaceChangeSource =
  | "claude-checkpoint"
  | "codex-turn-diff"
  | "opencode-session-diff"
  | "acp-tool-diff"
  | "pi-tool-patch"
  | "git-checkpoint"
  | "filesystem-checkpoint";

type WorkspaceChangeCoverage = "workspace" | "provider-file-tools" | "tool-call";

type TurnFileChange = {
  path: string;
  previousPath?: string | null;
  operation: "add" | "modify" | "delete" | "rename";
  reviewKind: "text" | "document" | "spreadsheet" | "image" | "binary";
  additions?: number | null;
  deletions?: number | null;
  patch?: string | null;
  beforeHash?: string | null;
  afterHash?: string | null;
};

type TurnChangeSet = {
  id: string;
  sessionId: string;
  messageId: string;
  providerTurnId?: string | null;
  source: WorkspaceChangeSource;
  coverage: WorkspaceChangeCoverage;
  files: TurnFileChange[];
  additions?: number | null;
  deletions?: number | null;
  nativeCheckpointRef?: string | null;
  hostBeforeCheckpointRef?: string | null;
  hostAfterCheckpointRef?: string | null;
  status: "collecting" | "ready" | "partial" | "error";
  createdAt: string;
  updatedAt: string;
};
```

Exact names may change to match existing repository vocabulary, but the following distinctions must
remain explicit:

- source;
- coverage;
- provider turn reference;
- native checkpoint reference;
- host checkpoint references;
- file undo versus conversation rollback.

## Workspace Change Module

Create a deep module in the daemon around a small interface. Suggested conceptual shape:

```ts
interface WorkspaceChangeCoordinator {
  beginTurn(input: BeginTurnInput): Promise<void>;
  finalizeTurn(input: FinalizeTurnInput): Promise<TurnChangeSet>;
  undo(input: UndoTurnChangesInput): Promise<UndoTurnChangesResult>;
}
```

The implementation should hide:

- provider-native capability selection;
- native evidence merging;
- Git versus filesystem checkpoint selection;
- blob storage;
- conflict checks;
- recovery checkpoints;
- cleanup and retention.

Do not expose Git commands or provider-specific result types to the renderer.

## Native Capability Shape

Do not add one ambiguous `supportsCheckpoint` boolean. The provider axes differ.

Suggested capability metadata:

```ts
type AgentWorkspaceChangeCapabilities = {
  turnDiff: "full" | "tool-level" | "none";
  fileRewind: "native" | "none";
  coverage: "workspace" | "provider-file-tools" | "tool-call";
  conversationRevert: boolean;
};
```

Keep callable provider-native operations internal to the agent session and coordinator. The renderer
should only see canonical change sets and undo results.

## Git Checkpoint Fallback

Follow the useful part of T3 Code's approach:

1. Create an isolated temporary Git index with `GIT_INDEX_FILE`.
2. Seed it from `HEAD` when present.
3. Run `git add -A -- .`.
4. Run `git write-tree`.
5. Create a hidden commit with `git commit-tree`.
6. Store it under a hidden ref such as:

```text
refs/cocurdex/checkpoints/<session-id>/turn/<message-id>/<before|after>
```

7. Diff hidden checkpoint commits for final workspace coverage.

Do not copy T3 Code's destructive restore implementation unchanged. In particular, do not run a
workspace-wide `git clean -fd -- .` during ordinary turn undo.

## Filesystem Checkpoint Fallback

For non-Git workspaces:

1. Capture a manifest containing relative path, file type, size, modification time, and SHA-256.
2. Store file contents in a content-addressed blob store.
3. Deduplicate identical blobs across checkpoints.
4. Compare before and after manifests for add, modify, delete, and rename.
5. Use matching hashes to infer renames where unambiguous.
6. Restore exact bytes; semantic document parsing is only for Review.
7. Ignore known transient files such as Office lock files through an explicit, tested policy.

The daemon owns manifests and blobs. The renderer must not own persistent checkpoint state.

## Evidence Merge Policy

Use this order:

1. Provider-native evidence for low-latency display and provider-specific fidelity.
2. Host checkpoint diff for final workspace coverage.
3. Merge without double-counting the same path.
4. Mark the change set `partial` when final host coverage is unavailable.

Examples:

- Codex native diff supplies the text patch; the host checkpoint adds a file written by Bash.
- Claude dry-run supplies native file names and stats; the host checkpoint adds an XLSX modified by
  an MCP tool.
- ACP supplies old/new text for an edit; the host checkpoint detects a formatter's additional
  writes.

Provider-native evidence should win for display when both sources represent the same exact file
transition. The host checkpoint remains the authority for completeness and conflict-safe restore.

## Safe Undo

Undo must use compare-and-swap semantics:

1. Resolve the target change set.
2. Preflight every affected path.
3. Require the current content hash to match the recorded `afterHash` before restoring that path.
4. If any path differs, return structured conflicts and do not overwrite silently.
5. Capture a recovery checkpoint before modification.
6. Apply changes using temporary files and atomic rename where supported.
7. Restore only paths affected by the turn.
8. Return per-file success, conflict, and failure results.

For Claude native rewind:

1. Call `rewindFiles(..., { dryRun: true })`.
2. Compare the native preview with the canonical change set.
3. Run Cocurdex hash conflict checks.
4. Capture a host recovery checkpoint.
5. Use native rewind only when its coverage is sufficient for the selected undo.
6. Otherwise use the host checkpoint restore path.

Do not combine a partial native rewind and host restore without a recovery strategy. A failure
between the two operations must not leave the workspace in an unknown mixed state.

## Review Behavior by File Type

First delivery:

| File kind | Review behavior |
| --- | --- |
| Markdown and other text | Unified line diff |
| DOCX | Modified status, metadata, open before/after versions |
| XLSX | Modified status, metadata, open before/after versions |
| Images | Before/after preview, dimensions and size |
| Other binary | Modified status, type and size |

Use exact binary blobs for undo regardless of Review representation.

Semantic DOCX, XLSX, PDF, and image comparison can be added later behind file-review adapters.

## UI Plan

Add the product UI outside `apps/desktop/src/components/ui`.

Suggested feature locality:

```text
apps/desktop/src/features/turn-workspace-changes/
```

The folder should contain its card, review composition, hooks, utilities, and tests, with an
`index.ts` exposing only the public feature interface.

The card should support:

- collecting state while the turn runs;
- final file count and available stats;
- compact file preview;
- expand/collapse;
- Review action;
- Undo action;
- conflict and partial-coverage states;
- binary file labels without fake line statistics.

Reuse the existing diff renderer where practical, but do not reuse HEAD-based Git discard semantics.

## Persistence and Cleanup

Persist canonical metadata through the daemon-owned database and RPC layer.

For host checkpoint content:

- use content hashes for deduplication;
- impose per-file and total storage limits;
- retain recent checkpoints according to a documented policy;
- keep recovery checkpoints long enough to support undo recovery;
- delete hidden Git refs and unreferenced blobs during cleanup;
- recover safely after daemon interruption.

## Implementation Phases

### Phase 1: Contracts and Coordinator

- Add canonical contracts and events.
- Add persistence and RPC operations.
- Implement coordinator state transitions.
- Associate changes with session, message, and provider turn IDs.

### Phase 2: Native Provider Integrations

- Claude checkpoint enablement, dry-run summary, and native rewind.
- Codex `turn/diff/updated` ingestion.
- OpenCode `session.diff` ingestion.
- ACP turn aggregation.
- Pi Edit patch extraction.

### Phase 3: Host Checkpoints

- Git hidden-ref adapter.
- Filesystem manifest/blob adapter.
- Evidence merge and coverage reporting.
- Retention and cleanup.

### Phase 4: Review UI

- Changed files card.
- Text diff Review.
- Binary before/after Review.
- Collecting, partial, unavailable, and error states.

### Phase 5: Safe Undo

- Hash preflight.
- Recovery checkpoint.
- Path-scoped restore.
- Claude native rewind selection.
- Conflict UX and retry.

### Phase 6: Follow-Up Semantic Review

- DOCX paragraph/table comparison.
- XLSX worksheet/cell/formula comparison.
- PDF page/text comparison.
- Image visual comparison.

## Testing Priorities

High-value tests should cover:

- canonical merge of native and host evidence;
- repeated edits to the same path within one turn;
- add, modify, delete, and rename;
- Bash changes missing from Codex or Claude native evidence;
- Claude dry-run and rewind selection;
- host fallback when native coverage is incomplete;
- current hash mismatch preventing overwrite;
- recovery checkpoint creation before restore;
- binary file byte-exact restore;
- non-Git workspace manifests and blob deduplication;
- Office transient file filtering;
- interrupted and failed turns;
- daemon restart and cleanup;
- two sessions sharing a workspace;
- path traversal, symlink, and hard-link safety.

Avoid tests for incidental DOM hierarchy or class names.

## Required Validation

After implementation, follow repository validation rules for every changed file:

1. Run focused TypeScript type checking for the changed TypeScript source files.
2. Run `pnpm exec biome check --write <changed-files>`.
3. Run focused adapter, daemon, shared, RPC, and Desktop tests according to the changed packages.
4. If new `t("...")` calls are added, run Desktop i18n extraction, add both `en-US` and `zh-CN`,
   then run i18n type generation.
5. Run `git diff --check`.
6. Do not start the Desktop development server. Ask the user to perform manual Desktop validation.

## Suggested Skills

- `codebase-design`: define the coordinator and checkpoint seam as a deep module.
- `tdd`: use for merge policy, manifest diffing, conflict checks, and restore state transitions.
- `find-docs`: re-check current Claude Agent SDK, OpenCode SDK, Pi SDK, and ACP contracts before
  implementation.
- `shadcn`: reuse existing installed UI primitives when composing the card or Review surface.
- `debug-desktop`: manually verify the completed Desktop UI after the user starts the app.

The always-active no-direct-`useEffect` rule applies to React implementation.

## Open Questions to Resolve During Implementation

1. Whether native workspace operations belong as optional methods on `AgentSession` or behind a
   narrower internal adapter owned by the coordinator.
2. The exact daemon database schema and blob storage location.
3. Retention limits and maximum supported file size.
4. Whether a shared-workspace conflict disables Undo entirely or offers a force path.
5. Whether first delivery should expose conversation rollback separately for providers that support
   it.

Prefer narrow, root-cause-oriented changes. Do not add provider-specific branches to the renderer.
