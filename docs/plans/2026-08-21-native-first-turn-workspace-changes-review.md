# Native-First Turn Workspace Changes: Review Findings

## Status

The current implementation should not be merged yet. The native-first architecture is generally in
place across Claude, Codex, OpenCode, ACP/Grok, and Pi, but the current Undo path can report success
without restoring files and still has workspace-escape and partial-restore risks.

This document is a repair checklist for the implementation in:

- `docs/plans/2026-08-21-native-first-turn-workspace-changes.md`

Do not replace native provider integrations with a Git-only implementation. Preserve the intended
model:

1. Provider-native evidence for display fidelity and low latency.
2. Host checkpoints for complete workspace coverage and conflict-safe restore.
3. Native rewind only when Cocurdex can prove that it covers the complete selected transition.

## P1: Required Before Merge

### 1. Prevent workspace escape for missing files and rename sources

Affected code:

- `packages/daemon/src/workspace-changes/path-safety.ts`
- `packages/daemon/src/workspace-changes/coordinator.ts`
- `packages/daemon/src/workspace-changes/filesystem-checkpoint.ts`
- `packages/daemon/src/workspace-changes/git-checkpoint.ts`
- `packages/shared/src/workspace-change-diff.ts`

Problems:

- `assertSafeWorkspaceFile()` returns immediately when the target does not exist. It does not resolve
  the nearest existing parent, so restoring a deleted file can write through a parent symlink that
  now points outside the workspace.
- Undo validates `file.path`, but filesystem rename restore writes to `previousPath` without applying
  the same normalization and symlink checks.
- Native evidence can replace the host `previousPath`, so provider-originated paths must never be
  trusted implicitly.

Required repair:

1. Normalize and validate both `path` and `previousPath` before preflight or restore.
2. For a missing target, walk upward to the nearest existing ancestor and verify its real path stays
   inside the real workspace root.
3. Reject symlinks and unsafe hard links at every destructive target.
4. Make checkpoint adapters consume already validated path plans or apply the same shared validator.
5. Never pass an unchecked provider path directly to `path.join()`, `rm()`, or an atomic writer.

Acceptance tests:

- Undo a deleted file after replacing its parent directory with a symlink to an external directory.
- Reject a rename whose `previousPath` is `../outside.txt`, absolute, drive-qualified, or beneath a
  symlink parent.
- Verify both Git and filesystem checkpoint adapters obey the same safety contract.

### 2. Make binary and large-file restore truthful and byte-exact

Affected code:

- `packages/daemon/src/workspace-changes/hash.ts`
- `packages/daemon/src/workspace-changes/filesystem-checkpoint.ts`
- `packages/daemon/src/workspace-changes/git-checkpoint.ts`
- `packages/daemon/src/workspace-changes/coordinator.ts`

Problems:

- Files larger than `MAX_CHECKPOINT_FILE_BYTES` are hashed but not stored by the filesystem adapter.
- Git blob reads use the same limit and return `null` when the blob exceeds it.
- Both restore adapters silently skip a missing blob, while the coordinator returns `restored` for
  every preflight entry.
- The filesystem adapter hashes a live file and then reads it separately. A concurrent Office
  autosave can change the bytes between those operations, leaving the manifest pointed at a blob
  that was never stored.

Required repair:

1. Define and document the maximum supported checkpoint size and total checkpoint quota.
2. Either store the exact bytes required for Undo or mark the file and change set as non-restorable.
3. Never return `restored` for a file whose bytes were not written and verified.
4. Hash the exact byte buffer that is stored, or use a stable streaming capture that detects and
   retries concurrent modification.
5. Return structured per-file failures for unsupported or unavailable blobs.
6. Preserve byte-exact restore for DOCX, XLSX, images, PDFs, and other binary formats.

Acceptance tests:

- Modify and Undo binary files immediately below and above the configured per-file limit.
- Verify restored bytes, not only hashes or status values.
- Mutate a file between metadata collection and storage and verify capture retries or fails clearly.
- Confirm Review and Undo do not claim that an unavailable before/after blob exists.

### 3. Finalize interrupted and failed turns

Affected code:

- `packages/daemon/src/service.ts`
- `packages/daemon/src/workspace-changes/coordinator.ts`

Problem:

`stopSession()` and provider error events call `failTurn()`, which only persists `status: "error"` and
deletes the active turn. It does not capture an after checkpoint or diff. Files written before an
interruption therefore disappear from the per-turn history and cannot be undone.

Required repair:

1. Replace the terminal split between `finalizeTurn()` and `failTurn()` with one finalization path
   that always attempts an after checkpoint and host diff after a before checkpoint exists.
2. Preserve the terminal outcome separately from checkpoint availability, for example completed,
   interrupted, or failed plus ready, partial, or error coverage.
3. Do not delete active turn state until the final capture/persistence attempt finishes.
4. Ensure a late `turn.completed` or error event cannot finalize the same turn twice.

Acceptance tests:

- Interrupt after one text edit and verify the change card, Review, and Undo.
- Emit a provider error after a file write and verify the same behavior.
- Cover event races between stop, error, and `turn.completed`.

### 4. Make multi-file Undo recoverable and report real per-file outcomes

Affected code:

- `packages/daemon/src/workspace-changes/coordinator.ts`
- both host checkpoint adapters
- shared Undo result contracts

Problem:

A recovery checkpoint is captured, but sequential restore exceptions are not caught. If the third
file fails after two files were restored, the RPC rejects and leaves the workspace partially
restored. The recovery checkpoint is not applied or returned through a usable structured result.

Required repair:

1. Keep all-path conflict preflight before any mutation.
2. Have adapters return a result for every requested path instead of silently continuing.
3. If restore fails after mutation begins, restore the recovery checkpoint or return an explicit
   recovery operation that is persisted and usable after restart.
4. Do not report aggregate `restored` unless every selected file was restored and verified.
5. Serialize overlapping Undo operations for the same workspace.

Acceptance tests:

- Inject a failure on the second file in a three-file restore.
- Verify either the original post-turn state is fully recovered or the API returns complete,
  actionable recovery metadata.
- Verify no file is marked restored unless its final hash matches the expected before hash.

### 5. Prove Claude native rewind coverage by transition, not only path

Affected code:

- `packages/daemon/src/workspace-changes/native-rewind.ts`
- Claude native checkpoint integration

Problem:

The current check only verifies that the native preview contains all canonical paths. This does not
prove that the native checkpoint represents the same before/after transition. For example, Bash can
modify a file before Claude Edit touches the same path. Claude's backup may then contain the Bash
state rather than the turn-start state, even though the path sets match.

Required repair:

1. Compare native preview coverage with canonical paths, operations, and host before/after hashes.
2. Use native rewind only when the provider can prove the complete selected transition.
3. Otherwise use the host checkpoint restore for the entire selection.
4. Do not mix a partial native rewind and host restore without an automatic recovery strategy.
5. Treat native `skippedLinks` or equivalent skipped-file results as failures, not success.

Acceptance tests:

- Bash modifies a file before Claude Edit modifies the same file.
- Claude Edit modifies a file before Bash modifies the same file.
- Native preview returns matching paths but incomplete transition coverage.
- Native rewind reports skipped links or partial restoration.

## P2: Required Lifecycle and Cross-Platform Repairs

### 6. Reset and correlate native evidence per provider turn

Affected code:

- `packages/agent-adapters/src/opencode/opencode-adapter.ts`
- `packages/agent-adapters/src/codex/codex-adapter.ts`
- `packages/agent-adapters/src/pi-sdk/pi-sdk-adapter.ts`
- `packages/shared/src/workspace-change-diff.ts`

Problems:

- OpenCode does not clear `lastNativeDiff` when a new user turn begins, so a no-diff turn can reuse
  the previous turn's evidence.
- The OpenCode fallback query passes a Cocurdex message UUID even though it is not the provider
  message ID.
- A valid empty Codex diff update is ignored because an empty string is treated as no event.
- Pi retains only the latest patch for a path, so repeated edits within one turn can produce
  incomplete native statistics or review text.
- Native operation and stats currently replace host semantics without first proving that both
  sources describe the same transition.

Required repair:

1. Reset native evidence at the accepted user-turn boundary in every adapter.
2. Correlate evidence by provider turn/message ID, not the Cocurdex message ID unless the provider
   explicitly received that ID.
3. Accept an empty provider snapshot as authoritative empty native evidence for that provider turn.
4. Aggregate repeated provider edits in turn order.
5. Let native patch/stats win only for a transition that matches the host evidence; host operation,
   hashes, and completeness remain authoritative for Undo.

Acceptance tests:

- A changed OpenCode turn followed by a no-change turn.
- Codex emits a non-empty diff followed by an empty snapshot in the same turn.
- Pi edits the same path multiple times in one turn.
- Stale native `add` evidence is merged with a host `modify` and must not turn Undo into deletion.

### 7. Persist checkpoint kind and make restart behavior stable

Affected code:

- shared `TurnChangeSet` contract
- SQLite schema and repository
- `packages/daemon/src/workspace-changes/coordinator-file-content.ts`
- Undo checkpoint resolution

Problem:

Only opaque before/after ref strings are persisted. After daemon restart, Cocurdex interprets them
using whichever checkpoint adapter matches the workspace now. A filesystem manifest ID can be
treated as a Git revision after `git init`, or a Git commit can be treated as a manifest after `.git`
is removed.

Required repair:

1. Persist the checkpoint kind together with every before, after, and recovery ref.
2. Resolve persisted checkpoints with their recorded adapter, independent of current workspace
   state.
3. Add migration and restart coverage.

Acceptance tests:

- Capture in a non-Git folder, restart, run `git init`, then Review and Undo.
- Capture in Git, restart after removing or relocating `.git`, then return a truthful structured
  result without misinterpreting the ref.

### 8. Use Windows-safe manifest identifiers

Affected code:

- `packages/daemon/src/workspace-changes/filesystem-checkpoint.ts`

Problem:

Manifest IDs contain `:` and are used directly as filenames. Colons are invalid in Windows
filenames, so filesystem capture fails for the ordinary-folder scenario.

Required repair:

Use a cross-platform opaque ID or encode filesystem filenames independently from logical checkpoint
identity. Do not rely on replacing only known separators in user/provider IDs.

Acceptance tests:

- Capture, Review, Undo, and cleanup on a Windows-compatible filesystem path.
- Include session, message, and phase values containing punctuation.

### 9. Implement checkpoint quotas, retention, and cleanup

Affected code:

- Git and filesystem checkpoint adapters
- session deletion and daemon startup cleanup
- blob store

Problems:

- Git `cleanup()` is a no-op and no caller removes `refs/cocurdex/checkpoints/*`.
- Filesystem manifests and blobs are not pruned.
- Recovery refs are retained indefinitely.
- There are no enforced per-file or total storage quotas.

Required repair:

1. Persist enough ownership metadata to enumerate checkpoints by session, turn, and age.
2. Delete hidden Git refs when their owning checkpoint expires or session is deleted.
3. Delete filesystem manifests and garbage-collect unreferenced blobs.
4. Document retention for before, after, and recovery checkpoints.
5. Run bounded, restart-safe cleanup without deleting checkpoints referenced by live change sets.

Acceptance tests:

- Delete a session and verify its refs/manifests and unreferenced blobs are removed.
- Preserve deduplicated blobs still referenced by another checkpoint.
- Restart during cleanup and verify cleanup is idempotent.
- Verify enforced total and per-file quotas.

## Adapter Acceptance Matrix

| Adapter | Native evidence | Native file rewind | Required fallback | Adapter-specific repair |
| --- | --- | --- | --- | --- |
| Claude | Dry-run checkpoint summary | Yes | Git/filesystem | Prove full transition coverage before native rewind |
| Codex app-server | `turn/diff/updated` | No | Git/filesystem | Handle empty snapshots and correlate by turn ID |
| OpenCode | `session.diff` | No | Git/filesystem | Reset evidence and use the provider message ID |
| ACP/Grok | Tool-call diff evidence | No | Git/filesystem | Keep tool-call coverage explicit; host remains completeness authority |
| Pi | Edit-tool patch evidence | No | Git/filesystem | Aggregate repeated edits within the turn |

All adapters must pass the same host-level tests for Bash writes, MCP writes, binary files, conflicts,
restart, interruption, path safety, and byte-exact Undo.

## Validation Required After Repair

Run the repository-required validation for every changed source file, plus:

```bash
pnpm --filter @cocurdex/shared test
pnpm --filter @cocurdex/db exec vitest run src/schema.test.ts
pnpm --filter @cocurdex/agent-adapters test
pnpm --filter @cocurdex/daemon test
pnpm --filter @cocurdex/desktop exec tsc --noEmit
pnpm --filter @cocurdex/shared exec tsc --noEmit
pnpm --filter @cocurdex/agent-adapters exec tsc --noEmit
pnpm --filter @cocurdex/daemon exec tsc --noEmit
pnpm --filter @cocurdex/desktop i18n:types
pnpm exec biome check --write <changed-files>
git diff --check
```

The current focused tests pass but do not cover the failures listed above. Add regression tests before
considering a passing existing suite sufficient.

Do not start the Desktop development server. After automated validation, ask the user to verify the
Review and Undo flows manually in the packaged/running Desktop application on macOS, then Windows.

## Second Review: Remaining Work

The second implementation pass resolves or substantially improves the following first-review items:

- unsafe lexical `previousPath` values and missing-parent symlink validation;
- silent successful Undo for unavailable large-file blobs;
- stable hashing of the exact stored filesystem bytes;
- after-checkpoint capture for interrupted and failed turns;
- persisted checkpoint kind and restart-safe adapter selection;
- Windows-safe filesystem manifest IDs;
- structured per-file restore results;
- Codex empty diff snapshots;
- OpenCode evidence reset at the accepted turn boundary;
- hidden Git ref deletion and filesystem blob garbage collection;
- per-workspace Undo serialization.

The implementation must still address every finding below before merge.

### P1. Count only newly stored bytes against the filesystem quota

Affected code:

- `packages/daemon/src/workspace-changes/filesystem-manifest.ts`
- `packages/daemon/src/workspace-changes/blob-store.ts`
- `packages/daemon/src/workspace-changes/capture-file.ts`

Problem:

`walkWorkspace()` calculates remaining quota from current blob-store usage, then subtracts the full
size of every file reported as stored. `CheckpointBlobStore.put()` returns only a hash, so the caller
cannot distinguish a newly written blob from an already existing content-addressed blob.

On a later checkpoint of a large unchanged workspace, existing deduplicated content consumes quota a
second time within the capture. Files encountered later are marked `stored: false` even though their
exact blobs already exist. A subsequent modification can therefore become falsely non-restorable.

Required repair:

1. Make the blob-store write result report whether a blob was newly created and how many new bytes
   were allocated.
2. Decrement `remainingQuota` only by newly allocated bytes.
3. Check for an existing exact hash before rejecting a file because the remaining quota is smaller
   than the file.
4. Keep the total quota race-safe when two sessions capture the same workspace concurrently.

Acceptance tests:

- Capture an unchanged workspace repeatedly when existing blobs are close to the total quota.
- Verify every existing deduplicated blob remains `stored: true` in later manifests.
- Capture the same new content concurrently from two sessions and count its bytes only once.
- Modify a file after repeated checkpoints and verify its original bytes remain Undoable.

### P1. Preserve file metadata and cross-platform replacement semantics

Affected code:

- `packages/daemon/src/workspace-changes/atomic-write.ts`
- filesystem and Git restore adapters

Problem:

`writeFileAtomically()` writes a new default-mode temporary file and renames it over the target. On
macOS and Linux, modifying an executable or restricted file resets its permission bits to the
temporary file defaults. The deterministic temporary filename can also collide with stale files or
unexpected concurrent callers. Windows replacement behavior is not covered.

Required repair:

1. Capture and restore the original file mode for modifications and renames.
2. Decide and document the mode used when restoring a deleted file.
3. Use a collision-resistant temporary filename in the target directory.
4. Clean up temporary files on write or rename failure.
5. Implement and test reliable replacement of an existing target on Windows.
6. Keep the final write atomic where the platform supports it.

Acceptance tests:

- Undo a modification to an executable file and preserve its executable bits.
- Preserve a non-default restrictive file mode.
- Recover after an injected write or rename failure without leaving a conflicting temp file.
- Replace an existing file and restore a deleted file on Windows.

### P1. Close the symlink time-of-check/time-of-use window

Affected code:

- `packages/daemon/src/workspace-changes/path-safety.ts`
- `packages/daemon/src/workspace-changes/filesystem-checkpoint.ts`
- `packages/daemon/src/workspace-changes/git-checkpoint.ts`
- `packages/daemon/src/workspace-changes/undo-turn.ts`

Problem:

The new ancestor validation correctly rejects unsafe paths during preflight and again at the start of
each adapter restore. However, the adapter then awaits blob or Git reads before calling
`writeFileAtomically()` or `rm()`. Another process can replace an ancestor with a symlink between the
validation and mutation.

Required repair:

1. Revalidate the full target chain immediately before every write, rename, and removal.
2. Prefer directory-handle-relative or no-follow operations when available instead of relying only
   on repeated path-string checks.
3. Apply the same protection to recovery restoration.
4. Treat a detected path change as a structured conflict/failure and do not continue mutating other
   paths unless the recovery policy guarantees a safe result.

Acceptance tests:

- Replace a parent directory with an external symlink after preflight but before the blob read
  completes.
- Repeat the race for write, remove-added-file, rename-source, and recovery restoration.
- Verify no external file is created, removed, or overwritten.

### P1. Run recovery for every exception after mutation can begin

Affected code:

- `packages/daemon/src/workspace-changes/undo-turn.ts`
- `packages/daemon/src/workspace-changes/native-rewind.ts`

Problem:

Recovery currently runs only after restore returns structured non-success results. There is no outer
exception boundary around native rewind, host restore, verification, and recovery. The real native
rewind call can throw after the provider has partially changed files. An unexpected adapter-level
exception can likewise reject the RPC before `restoreRecoverySnapshot()` is reached.

Required repair:

1. Establish an outer `try/catch` after the recovery checkpoint is persisted.
2. Track whether any native or host mutation may have started.
3. On every thrown error after that point, attempt recovery before returning or rethrowing.
4. Return structured per-file failure plus an explicit recovery status.
5. Do not swallow recovery failure. Persist and expose whether automatic recovery succeeded, failed,
   or was not attempted.

Acceptance tests:

- Native dry-run succeeds, but real native rewind mutates one file and throws.
- A host adapter restores one path and then throws at adapter level.
- Verification throws after restore.
- Recovery itself fails; the response must identify an unknown/mixed workspace state.

### P2. Make Claude native rewind reachable or stop advertising it

Affected code:

- `packages/daemon/src/workspace-changes/undo-turn.ts`
- `packages/daemon/src/workspace-changes/native-rewind.ts`
- persisted change-set/native evidence contracts

Problem:

`undoTurnChanges()` always passes `null` as the native transition evidence. The coverage predicate
rejects absent native files, so the real Claude native rewind path is unreachable and every Undo uses
the host fallback.

Required repair:

1. Persist or otherwise reconstruct the native transition evidence required by the coverage check.
2. Pass that evidence into `tryNativeRewind()`.
3. Use native rewind only when paths, operations, hashes, and skipped-file results prove complete
   coverage.
4. If Claude cannot provide sufficient evidence to prove the transition, model the capability as
   unavailable instead of keeping unreachable native-rewind code and advertising `fileRewind:
   "native"`.

Acceptance tests:

- A fully proven Claude transition invokes real native rewind exactly once after dry-run.
- An incomplete transition uses only the host adapter.
- Capability reporting matches the path that can actually execute.

### P2. Keep interrupted turn cards visible without requiring a reload

Affected code:

- `packages/daemon/src/workspace-changes/complete-turn.ts`
- `apps/desktop/src/features/turn-workspace-changes/turn-changes-store.ts`
- chat message composition

Problem:

An early interruption may finalize before any assistant message is persisted, leaving
`changeSet.messageId` empty. The live store removes the collecting change set and only inserts a final
change set when `messageId` is non-empty. The card disappears from the current conversation even
though a later transcript reload can key it by `userMessageId`.

Required repair:

1. Give every final change set a stable render anchor, using the assistant message when available and
   the originating user message otherwise.
2. Apply the same lookup rule to live events and transcript hydration.
3. Keep the collecting-to-final transition stable without moving or temporarily hiding the card.

Acceptance tests:

- Stop immediately after a file write but before an assistant message is emitted.
- Emit a provider error under the same timing.
- Verify the final card, Review, and Undo remain available without switching sessions or reloading.

### P2. Preserve a full-turn Pi patch for repeated edits

Affected code:

- `packages/agent-adapters/src/pi-sdk/pi-sdk-adapter.ts`
- native evidence aggregation helpers
- `packages/shared/src/workspace-change-diff.ts`

Problem:

Repeated Pi edits now aggregate operation and statistics, but the aggregate keeps the latest patch.
For A to B followed by B to C, the native patch describes only B to C and can replace the host A to C
Review because transition matching currently checks only operation and `previousPath`.

Required repair:

1. Preserve the first before content and latest after content for each path, then generate an A to C
   patch at finalization.
2. Alternatively, use the host full-turn patch whenever native evidence cannot prove it represents
   the complete transition.
3. Do not call operation/path equality proof of the same content transition.

Acceptance tests:

- Edit one text file three times in one Pi turn and verify the displayed patch is turn-start to
  turn-end.
- Include add-then-modify, delete-then-add, and rename/edit sequences.

### P2. Complete OpenCode provider message correlation

Affected code:

- `packages/agent-adapters/src/opencode/opencode-adapter.ts`
- OpenCode event handling/provider-state correlation

Problem:

The stale cache reset is fixed, but the message-scoped fallback only runs when
`input.providerTurnId` exists. OpenCode native evidence never assigns that provider message ID, so a
missed or delayed `session.diff` event cannot be recovered with the message-scoped query.

Required repair:

1. Capture the OpenCode provider user/assistant message ID from prompt or event handling.
2. Store it in the canonical provider correlation field with clearly named semantics.
3. Query `session.diff` with that provider ID during finalization when no matching live diff was
   received.
4. Reject a diff correlated to a different provider turn.

Acceptance tests:

- Suppress the live `session.diff` event and recover the current turn through the scoped query.
- Deliver a delayed previous-turn diff during a new turn and ensure it is ignored.

### P2. Represent non-restorable change sets truthfully in the UI

Affected code:

- `packages/daemon/src/workspace-changes/complete-turn.ts`
- shared change-set contracts
- `apps/desktop/src/features/turn-workspace-changes/turn-changes-card.tsx`

Problem:

Files rejected by the per-file limit or total quota are correctly marked `restorable: false`, but the
change set is still `ready` whenever before and after captures exist. The UI enables Undo without
checking file restorability, so the user only discovers the limitation after clicking it.

Required repair:

1. Model aggregate Undo availability separately from evidence coverage, or derive it consistently
   from every selected file.
2. Disable or narrow Undo when the requested selection contains a non-restorable file.
3. Show which files and size/quota reasons prevent Undo before the user clicks.
4. Keep Review available even when Undo is unavailable.

Acceptance tests:

- A turn modifies one file above the per-file limit.
- A turn contains both restorable and non-restorable files.
- A filesystem checkpoint reaches its total quota.
- Verify the card never claims full Undo availability for an unsupported selection.

### P2. Finish retention and restart cleanup

Affected code:

- `packages/daemon/src/workspace-changes/checkpoint-cleanup.ts`
- Git and filesystem checkpoint adapters
- daemon startup and session deletion

Problem:

Session deletion now removes owned refs and manifests, and startup reconciliation removes
unreferenced filesystem blobs. It does not prune orphan filesystem manifests or hidden Git refs left
by an interrupted capture. Live old change sets and recovery refs have no expiry policy, and Git
checkpoint capture has no total storage quota.

Required repair:

1. Define an actual age/count retention policy for normal and recovery checkpoints.
2. Reconcile orphan manifests and Git refs, not only filesystem blobs.
3. Enforce a bounded Git checkpoint policy or document and surface when Git cannot provide a
   checkpoint within the configured limits.
4. Make startup reconciliation awaitable or explicitly supervised; do not leave cleanup rejection as
   an unhandled background promise.
5. Preserve every checkpoint still referenced by a live change set.

Acceptance tests:

- Leave an orphan manifest and hidden Git ref without a DB row, restart, and verify cleanup.
- Expire old normal and recovery checkpoints according to the documented policy.
- Preserve referenced checkpoints across repeated reconciliation.
- Simulate interruption during reconciliation and verify idempotent recovery.

## Second Review Validation Baseline

The second pass had the following observed validation result before the remaining repairs:

- workspace-change focused tests: 36 passed;
- shared tests: 66 passed;
- adapter-focused tests: 17 passed;
- DB schema test: 1 passed;
- Desktop and shared TypeScript checks passed;
- Biome passed for the 30 modified and 7 newly added second-pass source files;
- `git diff --check HEAD` passed;
- full daemon tests had 94 passes and 3 sandbox-only socket/proxy failures;
- daemon package type checking remained blocked by unrelated existing Claude, proxy, and document
  attachment errors.

Passing the existing tests is not sufficient. Add the acceptance tests above and perform live Desktop
verification on macOS, followed by Windows validation for filesystem capture and replacement.
