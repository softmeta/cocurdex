import path from "node:path";
import type { AgentSession } from "@cocurdex/agent-core";
import type {
  TurnChangeSet,
  TurnFileChange,
  UndoFileResult,
  UndoRecoveryStatus,
  UndoTurnChangesResult,
} from "@cocurdex/shared";
import { removeWorkspaceFile, writeFileAtomically } from "./atomic-write";
import type { HostCheckpoint, HostCheckpointAdapter } from "./checkpoint";
import { resolveHostCheckpoint } from "./coordinator-file-content";
import { tryNativeRewind } from "./native-rewind";
import { assertSafeRestorePlan, resolveWorkspacePath } from "./path-safety";
import {
  preflightTurnUndo,
  undoHasBlockingFailures,
  undoHasConflicts,
} from "./preflight-undo";

const workspaceUndoLocks = new Map<string, Promise<unknown>>();

export async function withWorkspaceUndoLock<T>(
  workspaceRootPath: string,
  run: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(workspaceRootPath);
  const previous = workspaceUndoLocks.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(
    () => current,
    () => current,
  );
  workspaceUndoLocks.set(key, tail);
  try {
    await previous;
    return await run();
  } finally {
    release();
    if (workspaceUndoLocks.get(key) === tail) {
      workspaceUndoLocks.delete(key);
    }
  }
}

export async function undoTurnChanges(input: {
  changeSet: TurnChangeSet;
  workspaceRootPath: string;
  adapter: HostCheckpointAdapter;
  checkpoints: Map<string, HostCheckpoint>;
  getNativeSession?(sessionId: string): AgentSession | null;
  createId(): string;
  now(): string;
  persist(changeSet: TurnChangeSet): Promise<TurnChangeSet>;
}): Promise<UndoTurnChangesResult> {
  const { changeSet, workspaceRootPath, adapter } = input;
  const currentHashes = new Map<string, string | null>();
  for (const file of changeSet.files) {
    await assertSafeRestorePlan(workspaceRootPath, file);
    currentHashes.set(
      file.path,
      await adapter.hashWorkingTreeFile(workspaceRootPath, file.path),
    );
  }
  const preflight = preflightTurnUndo(changeSet.files, currentHashes);
  if (undoHasConflicts(preflight)) {
    return {
      changeSetId: changeSet.id,
      status: "conflict",
      files: preflight,
      recoveryCheckpointRef: null,
      recoveryStatus: "not-attempted",
    };
  }
  if (undoHasBlockingFailures(preflight)) {
    return {
      changeSetId: changeSet.id,
      status: "failed",
      files: preflight,
      recoveryCheckpointRef: null,
      recoveryStatus: "not-attempted",
    };
  }

  let recovery: HostCheckpoint;
  try {
    recovery = await adapter.capture({
      workspaceRootPath,
      sessionId: changeSet.sessionId,
      userMessageId: changeSet.userMessageId,
      phase: `recovery-${input.createId()}`,
    });
  } catch (error) {
    return {
      changeSetId: changeSet.id,
      status: "failed",
      files: changeSet.files.map((file) => ({
        path: file.path,
        status: "failed" as const,
        reason:
          error instanceof Error
            ? error.message
            : "Could not capture a recovery checkpoint",
      })),
      recoveryCheckpointRef: null,
      recoveryStatus: "not-attempted",
    };
  }
  input.checkpoints.set(recovery.id, recovery);
  const persisted = await input.persist({
    ...changeSet,
    hostRecoveryCheckpointRef: recovery.ref,
    hostRecoveryCheckpointKind: recovery.kind,
    updatedAt: input.now(),
  });

  let mutationMayHaveStarted = false;
  let restoreResults: UndoFileResult[] = [];
  let usedNative = false;
  try {
    const session = input.getNativeSession?.(persisted.sessionId) ?? null;
    const nativeAttempt = await tryNativeRewind(
      session,
      persisted,
      persisted.nativeFiles,
      () => {
        mutationMayHaveStarted = true;
      },
    );
    usedNative = nativeAttempt.used;
    if (!usedNative) {
      const before = resolveHostCheckpoint(
        persisted.hostBeforeCheckpointRef,
        persisted.hostBeforeCheckpointKind ?? adapter.kind,
        adapter,
        workspaceRootPath,
        input.checkpoints,
      );
      if (!before) {
        return {
          changeSetId: persisted.id,
          status: "failed",
          files: persisted.files.map((file) => ({
            path: file.path,
            status: "failed" as const,
            reason: "Host checkpoint is unavailable",
          })),
          recoveryCheckpointRef: recovery.ref,
          recoveryStatus: "not-attempted",
        };
      }
      mutationMayHaveStarted = true;
      restoreResults = await adapter.restorePaths({
        workspaceRootPath,
        checkpoint: before,
        paths: persisted.files,
      });
    }

    const verified = await verifyRestoredFiles(
      adapter,
      workspaceRootPath,
      persisted.files,
      restoreResults,
      usedNative,
    );
    if (verified.every((file) => file.status === "restored")) {
      // Record the undo so the turn cannot be undone twice and the card keeps
      // showing the right state after a reload. The recovery snapshot only
      // protects a failed undo, so drop it instead of waiting for expiry.
      await adapter
        .cleanup({
          refs: [recovery.ref],
          workspaceRootPath,
          sessionId: persisted.sessionId,
        })
        .catch(() => undefined);
      input.checkpoints.delete(recovery.id);
      input.checkpoints.delete(recovery.ref);
      await input.persist({
        ...persisted,
        hostRecoveryCheckpointRef: null,
        hostRecoveryCheckpointKind: null,
        status: "undone",
        undoable: false,
        updatedAt: input.now(),
      });
      return {
        changeSetId: persisted.id,
        status: "restored",
        files: verified,
        recoveryCheckpointRef: null,
        recoveryStatus: "not-attempted",
      };
    }

    const recoveryStatus = mutationMayHaveStarted
      ? await restoreRecoverySnapshot(
          adapter,
          workspaceRootPath,
          recovery,
          persisted.files,
        )
      : "not-attempted";
    return {
      changeSetId: persisted.id,
      status: "failed",
      files: verified,
      recoveryCheckpointRef: recovery.ref,
      recoveryStatus,
    };
  } catch (error) {
    const recoveryStatus = mutationMayHaveStarted
      ? await restoreRecoverySnapshot(
          adapter,
          workspaceRootPath,
          recovery,
          persisted.files,
        )
      : "not-attempted";
    return {
      changeSetId: persisted.id,
      status: "failed",
      files: persisted.files.map((file) => ({
        path: file.path,
        status: "failed" as const,
        reason:
          error instanceof Error
            ? error.message
            : "Undo failed after mutation began",
      })),
      recoveryCheckpointRef: recovery.ref,
      recoveryStatus,
    };
  }
}

async function verifyRestoredFiles(
  adapter: HostCheckpointAdapter,
  workspaceRootPath: string,
  files: TurnFileChange[],
  restoreResults: UndoFileResult[],
  usedNative: boolean,
) {
  const restoreByPath = new Map(
    restoreResults.map((result) => [result.path, result]),
  );
  const verified: UndoFileResult[] = [];
  for (const file of files) {
    const restore = restoreByPath.get(file.path);
    if (!usedNative && restore && restore.status !== "restored") {
      verified.push(restore);
      continue;
    }
    verified.push(await verifyRestoredFile(adapter, workspaceRootPath, file));
  }
  return verified;
}

async function verifyRestoredFile(
  adapter: HostCheckpointAdapter,
  workspaceRootPath: string,
  file: TurnFileChange,
): Promise<UndoFileResult> {
  if (file.operation === "add") {
    const current = await adapter.hashWorkingTreeFile(
      workspaceRootPath,
      file.path,
    );
    if (current != null) {
      return {
        path: file.path,
        status: "failed",
        reason: "Added file was not removed",
      };
    }
    return { path: file.path, status: "restored" };
  }

  const restorePath = file.previousPath ?? file.path;
  const current = await adapter.hashWorkingTreeFile(
    workspaceRootPath,
    restorePath,
  );
  if (current !== (file.beforeHash ?? null)) {
    return {
      path: file.path,
      status: "failed",
      reason: "Restored bytes do not match the before checkpoint",
    };
  }
  if (file.operation === "rename") {
    const leftover = await adapter.hashWorkingTreeFile(
      workspaceRootPath,
      file.path,
    );
    if (leftover != null) {
      return {
        path: file.path,
        status: "failed",
        reason: "Renamed file was not removed",
      };
    }
  }
  return { path: file.path, status: "restored" };
}

async function restoreRecoverySnapshot(
  adapter: HostCheckpointAdapter,
  workspaceRootPath: string,
  recovery: HostCheckpoint,
  files: TurnFileChange[],
): Promise<UndoRecoveryStatus> {
  const paths = new Set<string>();
  for (const file of files) {
    paths.add(file.path);
    if (file.previousPath) {
      paths.add(file.previousPath);
    }
  }
  try {
    for (const relativePath of paths) {
      await assertSafeRestorePlan(workspaceRootPath, { path: relativePath });
      const bytes = await adapter.readFile(recovery, relativePath);
      if (bytes) {
        const target = resolveWorkspacePath(workspaceRootPath, relativePath);
        await writeFileAtomically(target.absolute, bytes, {
          workspaceRootPath,
          relativePath,
        });
      } else {
        await removeWorkspaceFile(workspaceRootPath, relativePath);
      }
    }
    return "succeeded";
  } catch {
    return "failed";
  }
}
