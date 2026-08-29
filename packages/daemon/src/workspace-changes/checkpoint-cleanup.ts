import type { TurnChangeSetRepository } from "@cocurdex/db";
import type { TurnChangeSet } from "@cocurdex/shared";
import type { CheckpointBlobStore } from "./blob-store";
import type { HostCheckpointAdapter } from "./checkpoint";
import {
  CHECKPOINT_RETENTION_DAYS,
  MAX_RETAINED_CHECKPOINTS_PER_SESSION,
  MAX_RETAINED_CHECKPOINTS_TOTAL,
  RECOVERY_CHECKPOINT_RETENTION_DAYS,
} from "./hash";

const DAY_MS = 24 * 60 * 60 * 1000;

type RetentionRepository = Pick<TurnChangeSetRepository, "listAll" | "upsert">;

export async function applyCheckpointRetention(
  repository: RetentionRepository,
  options: { now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const changeSets = await repository.listAll();
  const retainedPerSession = new Map<string, number>();
  let retainedTotal = 0;
  const newestFirst = [...changeSets].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  for (const changeSet of newestFirst) {
    const age = now.getTime() - Date.parse(changeSet.createdAt);
    const retained = retainedPerSession.get(changeSet.sessionId) ?? 0;
    const hasUndoCheckpoint = Boolean(
      changeSet.hostBeforeCheckpointRef || changeSet.nativeCheckpointRef,
    );
    const undoExpired =
      hasUndoCheckpoint &&
      (age > CHECKPOINT_RETENTION_DAYS * DAY_MS ||
        retained >= MAX_RETAINED_CHECKPOINTS_PER_SESSION ||
        retainedTotal >= MAX_RETAINED_CHECKPOINTS_TOTAL);
    if (hasUndoCheckpoint && !undoExpired) {
      retainedPerSession.set(changeSet.sessionId, retained + 1);
      retainedTotal += 1;
    }

    const recoveryAge = now.getTime() - Date.parse(changeSet.updatedAt);
    const hasRecoveryCheckpoint = Boolean(changeSet.hostRecoveryCheckpointRef);
    const recoveryExpired =
      hasRecoveryCheckpoint &&
      recoveryAge > RECOVERY_CHECKPOINT_RETENTION_DAYS * DAY_MS;
    if (!undoExpired && !recoveryExpired) {
      continue;
    }

    const retainedChangeSet: TurnChangeSet = undoExpired
      ? {
          ...changeSet,
          hostBeforeCheckpointRef: null,
          hostBeforeCheckpointKind: null,
          hostAfterCheckpointRef: null,
          hostAfterCheckpointKind: null,
          hostRecoveryCheckpointRef: null,
          hostRecoveryCheckpointKind: null,
          nativeCheckpointRef: null,
          nativeFiles: null,
          undoable: false,
        }
      : {
          ...changeSet,
          hostRecoveryCheckpointRef: null,
          hostRecoveryCheckpointKind: null,
        };
    await repository.upsert(retainedChangeSet);
  }
}

function checkpointRefs(changeSet: TurnChangeSet) {
  return [
    changeSet.hostBeforeCheckpointRef,
    changeSet.hostAfterCheckpointRef,
    changeSet.hostRecoveryCheckpointRef,
  ].filter((ref): ref is string => Boolean(ref));
}

export async function collectLiveFilesystemRefs(
  repository: TurnChangeSetRepository,
  filesystemAdapter: HostCheckpointAdapter,
) {
  const changeSets = await repository.listAll();
  const filesystemRefs: string[] = [];
  const gitRefs = new Set<string>();
  const keepBlobs = new Set<string>();
  for (const changeSet of changeSets) {
    const refs = checkpointRefs(changeSet);
    if (changeSet.hostBeforeCheckpointKind === "git-checkpoint") {
      for (const ref of refs) {
        gitRefs.add(ref);
      }
    } else {
      filesystemRefs.push(...refs);
    }
  }
  const referenced =
    await filesystemAdapter.referencedBlobHashes?.(filesystemRefs);
  if (referenced) {
    for (const hash of referenced) {
      keepBlobs.add(hash);
    }
  }
  return { filesystemRefs, gitRefs, keepBlobs, changeSets };
}

export async function deleteSessionCheckpoints(input: {
  sessionId: string;
  workspaceRootPath?: string;
  repository: TurnChangeSetRepository;
  filesystemAdapter: HostCheckpointAdapter;
  gitAdapter: HostCheckpointAdapter;
  blobStore: CheckpointBlobStore;
}) {
  const changeSets = Object.values(
    await input.repository.listBySessionId(input.sessionId),
  );
  const filesystemRefs: string[] = [];
  const gitRefs: string[] = [];
  for (const changeSet of changeSets) {
    const refs = checkpointRefs(changeSet);
    const kind =
      changeSet.hostBeforeCheckpointKind ?? changeSet.hostAfterCheckpointKind;
    if (kind === "git-checkpoint") {
      gitRefs.push(...refs);
    } else {
      filesystemRefs.push(...refs);
    }
  }
  await input.filesystemAdapter.cleanup({
    refs: filesystemRefs,
    sessionId: input.sessionId,
  });
  await input.gitAdapter.cleanup({
    refs: gitRefs,
    workspaceRootPath: input.workspaceRootPath,
    sessionId: input.sessionId,
  });
  const remaining = await collectLiveFilesystemRefs(
    input.repository,
    input.filesystemAdapter,
  );
  await input.blobStore.gc(remaining.keepBlobs);
}

export async function reconcileCheckpoints(input: {
  repository: TurnChangeSetRepository;
  filesystemAdapter: HostCheckpointAdapter;
  gitAdapter: HostCheckpointAdapter;
  blobStore: CheckpointBlobStore;
  workspaceRootPaths?: string[];
}) {
  await applyCheckpointRetention(input.repository);
  const live = await collectLiveFilesystemRefs(
    input.repository,
    input.filesystemAdapter,
  );
  await input.filesystemAdapter.cleanup({
    refs: live.filesystemRefs,
    pruneUnreferenced: true,
  });
  for (const workspaceRootPath of input.workspaceRootPaths ?? []) {
    await input.gitAdapter.cleanup({
      refs: [...live.gitRefs],
      workspaceRootPath,
      pruneUnreferenced: true,
    });
  }
  const remaining = await collectLiveFilesystemRefs(
    input.repository,
    input.filesystemAdapter,
  );
  await input.blobStore.gc(remaining.keepBlobs);
}
