import type { AgentSession } from "@cocurdex/agent-core";
import type { TurnChangeSetRepository } from "@cocurdex/db";
import type {
  HostCheckpointKind,
  NativeWorkspaceChangeEvidence,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
  TurnChangeOutcome,
  TurnChangeSet,
  UndoTurnChangesInput,
  UndoTurnChangesResult,
} from "@cocurdex/shared";
import { sumFileStats } from "@cocurdex/shared";
import { createCheckpointBlobStore } from "./blob-store";
import type { HostCheckpoint, HostCheckpointAdapter } from "./checkpoint";
import {
  reconcileCheckpoints,
  deleteSessionCheckpoints as removeSessionCheckpoints,
} from "./checkpoint-cleanup";
import { type ActiveTurn, completeActiveTurn } from "./complete-turn";
import { readTurnChangeFileContent } from "./coordinator-file-content";
import { createFilesystemCheckpointAdapter } from "./filesystem-checkpoint";
import { createGitCheckpointAdapter } from "./git-checkpoint";
import { isGitWorkspace } from "./git-run";
import { sanitizeTurnFileChanges } from "./path-safety";
import { undoTurnChanges, withWorkspaceUndoLock } from "./undo-turn";

export interface BeginTurnInput {
  sessionId: string;
  userMessageId: string;
  workspaceRootPath: string;
}

export interface FinalizeTurnInput {
  sessionId: string;
  messageId: string;
}

export interface IngestNativeEvidenceInput {
  sessionId: string;
  userMessageId?: string | null;
  evidence: NativeWorkspaceChangeEvidence;
}

export interface WorkspaceChangeCoordinator {
  beginTurn(input: BeginTurnInput): Promise<TurnChangeSet>;
  markToolActivity(sessionId: string): void;
  ingestNativeEvidence(
    input: IngestNativeEvidenceInput,
  ): Promise<TurnChangeSet | null>;
  bindAssistantMessage(input: {
    sessionId: string;
    messageId: string;
  }): Promise<TurnChangeSet | null>;
  finalizeTurn(input: FinalizeTurnInput): Promise<TurnChangeSet | null>;
  failTurn(
    sessionId: string,
    outcome?: Exclude<TurnChangeOutcome, "completed">,
  ): Promise<TurnChangeSet | null>;
  undo(
    input: UndoTurnChangesInput & { workspaceRootPath: string },
  ): Promise<UndoTurnChangesResult>;
  listBySession(sessionId: string): Promise<Record<string, TurnChangeSet>>;
  getByMessageId(
    sessionId: string,
    messageId: string,
  ): Promise<TurnChangeSet | null>;
  getFileContent(
    input: TurnChangeFileContentRequest & { workspaceRootPath: string },
  ): Promise<TurnChangeFileContent>;
  deleteSessionCheckpoints(
    sessionId: string,
    workspaceRootPath?: string,
  ): Promise<void>;
  reconcile(workspaceRootPaths?: string[]): Promise<void>;
}

interface CoordinatorOptions {
  userDataPath: string;
  repository: TurnChangeSetRepository;
  now?(): string;
  createId?(): string;
  getNativeSession?(sessionId: string): AgentSession | null;
  onChangeSet?(changeSet: TurnChangeSet): void;
  createAdapter?(workspaceRootPath: string): Promise<HostCheckpointAdapter>;
}

export function createWorkspaceChangeCoordinator(
  options: CoordinatorOptions,
): WorkspaceChangeCoordinator {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const blobStore = createCheckpointBlobStore(options.userDataPath);
  const filesystemAdapter = createFilesystemCheckpointAdapter(
    blobStore,
    options.userDataPath,
  );
  const gitAdapter = createGitCheckpointAdapter();
  const activeTurns = new Map<string, ActiveTurn>();
  // Tool events that land before beginTurn resolves would otherwise be lost;
  // carrying them into the next turn only costs one extra diff.
  const pendingToolActivity = new Set<string>();
  const completingTurns = new Map<string, Promise<TurnChangeSet | null>>();
  const checkpoints = new Map<string, HostCheckpoint>();
  let checkpointMaintenanceGate = Promise.resolve();
  const activeCheckpointOperations = new Set<Promise<unknown>>();

  function withCheckpointOperation<T>(operation: () => Promise<T>) {
    const work = checkpointMaintenanceGate.then(operation, operation);
    activeCheckpointOperations.add(work);
    return work.finally(() => activeCheckpointOperations.delete(work));
  }

  function withCheckpointMaintenance<T>(operation: () => Promise<T>) {
    const previousGate = checkpointMaintenanceGate;
    let releaseGate: (() => void) | null = null;
    const nextGate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    checkpointMaintenanceGate = previousGate.then(() => nextGate);
    const pendingOperations = [...activeCheckpointOperations];
    const work = previousGate.then(async () => {
      await Promise.allSettled(pendingOperations);
      return operation();
    });
    return work.finally(() => {
      releaseGate?.();
    });
  }

  async function defaultCreateAdapter(workspaceRootPath: string) {
    return (await isGitWorkspace(workspaceRootPath))
      ? gitAdapter
      : filesystemAdapter;
  }

  const createAdapter = options.createAdapter ?? defaultCreateAdapter;

  function adapterForKind(kind: HostCheckpointKind) {
    return kind === "git-checkpoint" ? gitAdapter : filesystemAdapter;
  }

  async function persist(changeSet: TurnChangeSet) {
    await options.repository.upsert(changeSet);
    options.onChangeSet?.(changeSet);
    return changeSet;
  }

  // A turn that changed nothing keeps no row and no checkpoint: empty rows
  // would otherwise consume the per-session checkpoint retention budget and
  // evict change sets that are still undoable.
  async function discard(
    active: ActiveTurn,
    turnCheckpoints: (HostCheckpoint | null)[],
  ) {
    const refs = turnCheckpoints
      .filter((checkpoint): checkpoint is HostCheckpoint => checkpoint != null)
      .map((checkpoint) => {
        checkpoints.delete(checkpoint.ref);
        checkpoints.delete(checkpoint.id);
        return checkpoint.ref;
      });
    await options.repository.deleteById(active.changeSet.id);
    if (refs.length > 0) {
      await active.adapter
        .cleanup({
          refs,
          workspaceRootPath: active.workspaceRootPath,
          sessionId: active.changeSet.sessionId,
        })
        .catch(() => undefined);
    }
    const emptyChangeSet: TurnChangeSet = {
      ...active.changeSet,
      files: [],
      additions: 0,
      deletions: 0,
      hostBeforeCheckpointRef: null,
      hostBeforeCheckpointKind: null,
      hostAfterCheckpointRef: null,
      hostAfterCheckpointKind: null,
      undoable: false,
      status: "ready",
      updatedAt: now(),
    };
    // Still broadcast so the renderer drops the in-progress card for this turn.
    options.onChangeSet?.(emptyChangeSet);
    return emptyChangeSet;
  }

  function rememberCheckpoint(checkpoint: HostCheckpoint | null) {
    if (checkpoint) {
      checkpoints.set(checkpoint.ref, checkpoint);
      checkpoints.set(checkpoint.id, checkpoint);
    }
  }

  async function completeTurn(
    sessionId: string,
    messageId: string | undefined,
    outcome: TurnChangeOutcome,
  ) {
    const inFlight = completingTurns.get(sessionId);
    if (inFlight) {
      return inFlight;
    }
    const work = withCheckpointOperation(async () => {
      const active = activeTurns.get(sessionId);
      if (!active || active.finalized) {
        return active?.changeSet ?? null;
      }
      try {
        return await completeActiveTurn({
          active,
          messageId,
          outcome,
          getNativeSession: options.getNativeSession,
          now,
          persist,
          discard,
          rememberCheckpoint,
        });
      } finally {
        active.finalized = true;
        activeTurns.delete(sessionId);
      }
    });
    completingTurns.set(sessionId, work);
    try {
      return await work;
    } finally {
      completingTurns.delete(sessionId);
    }
  }

  async function adapterForChangeSet(
    changeSet: TurnChangeSet,
    workspaceRootPath: string,
  ) {
    const kind =
      changeSet.hostBeforeCheckpointKind ?? changeSet.hostAfterCheckpointKind;
    const current = await createAdapter(workspaceRootPath);
    if (!kind || current.kind === kind) {
      return current;
    }
    return adapterForKind(kind);
  }

  return {
    async beginTurn(input) {
      // A previous turn that never reached turn.completed/error would leak its
      // checkpoint here, so close it out before starting the next one.
      if (activeTurns.has(input.sessionId)) {
        await completeTurn(input.sessionId, undefined, "interrupted");
      }
      return withCheckpointOperation(async () => {
        const adapter = await createAdapter(input.workspaceRootPath);
        const timestamp = now();
        let before: HostCheckpoint | null = null;
        try {
          before = await adapter.capture({
            workspaceRootPath: input.workspaceRootPath,
            sessionId: input.sessionId,
            userMessageId: input.userMessageId,
            phase: "before",
          });
          rememberCheckpoint(before);
        } catch {
          before = null;
        }
        const changeSet: TurnChangeSet = {
          id: createId(),
          sessionId: input.sessionId,
          messageId: "",
          userMessageId: input.userMessageId,
          source: adapter.kind,
          coverage: before ? "workspace" : "tool-call",
          files: [],
          hostBeforeCheckpointRef: before?.ref ?? null,
          hostBeforeCheckpointKind: before?.kind ?? null,
          status: "collecting",
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        activeTurns.set(input.sessionId, {
          workspaceRootPath: input.workspaceRootPath,
          adapter,
          native: null,
          before,
          changeSet,
          touchedWorkspace: pendingToolActivity.delete(input.sessionId),
        });
        return persist(changeSet);
      });
    },

    markToolActivity(sessionId) {
      const active = activeTurns.get(sessionId);
      if (active) {
        active.touchedWorkspace = true;
        return;
      }
      pendingToolActivity.add(sessionId);
    },

    async ingestNativeEvidence(input) {
      const active = activeTurns.get(input.sessionId);
      if (!active) {
        return null;
      }
      if (
        input.userMessageId &&
        active.changeSet.userMessageId !== input.userMessageId
      ) {
        return active.changeSet;
      }
      const files = sanitizeTurnFileChanges(input.evidence.files);
      active.native = { ...input.evidence, files };
      const timestamp = now();
      const stats = sumFileStats(files);
      active.changeSet = {
        ...active.changeSet,
        source: input.evidence.source,
        coverage: input.evidence.coverage,
        files,
        additions: input.evidence.additions ?? stats.additions,
        deletions: input.evidence.deletions ?? stats.deletions,
        providerTurnId:
          input.evidence.providerTurnId ?? active.changeSet.providerTurnId,
        nativeCheckpointRef:
          input.evidence.nativeCheckpointRef ??
          active.changeSet.nativeCheckpointRef,
        updatedAt: timestamp,
      };
      return persist(active.changeSet);
    },

    async bindAssistantMessage(input) {
      const active = activeTurns.get(input.sessionId);
      if (!active) {
        return null;
      }
      active.changeSet = {
        ...active.changeSet,
        messageId: input.messageId,
        updatedAt: now(),
      };
      return persist(active.changeSet);
    },

    finalizeTurn(input) {
      return completeTurn(input.sessionId, input.messageId, "completed");
    },

    failTurn(sessionId, outcome = "failed") {
      return completeTurn(sessionId, undefined, outcome);
    },

    undo(input) {
      return withCheckpointOperation(() =>
        withWorkspaceUndoLock(input.workspaceRootPath, async () => {
          const changeSet =
            (await options.repository.getByMessageId(
              input.sessionId,
              input.messageId,
            )) ??
            (await options.repository.getByUserMessageId(
              input.sessionId,
              input.messageId,
            ));
          if (!changeSet) {
            throw new Error("Turn change set was not found");
          }
          const adapter = await adapterForChangeSet(
            changeSet,
            input.workspaceRootPath,
          );
          if (
            changeSet.hostBeforeCheckpointKind &&
            adapter.kind !== changeSet.hostBeforeCheckpointKind
          ) {
            return {
              changeSetId: changeSet.id,
              status: "failed" as const,
              files: changeSet.files.map((file) => ({
                path: file.path,
                status: "failed" as const,
                reason:
                  "Host checkpoint adapter does not match the recorded kind",
              })),
              recoveryCheckpointRef:
                changeSet.hostRecoveryCheckpointRef ?? null,
            };
          }
          return undoTurnChanges({
            changeSet,
            workspaceRootPath: input.workspaceRootPath,
            adapter,
            checkpoints,
            getNativeSession: options.getNativeSession,
            createId,
            now,
            persist,
          });
        }),
      );
    },

    listBySession(sessionId) {
      return options.repository.listBySessionId(sessionId);
    },

    getByMessageId(sessionId, messageId) {
      return options.repository.getByMessageId(sessionId, messageId);
    },

    async getFileContent(input) {
      const changeSet =
        (await options.repository.getByMessageId(
          input.sessionId,
          input.messageId,
        )) ??
        (await options.repository.getByUserMessageId(
          input.sessionId,
          input.messageId,
        ));
      if (!changeSet) {
        throw new Error("Turn change set was not found");
      }
      const adapter = await adapterForChangeSet(
        changeSet,
        input.workspaceRootPath,
      );
      return readTurnChangeFileContent(changeSet, input, adapter, checkpoints);
    },

    deleteSessionCheckpoints(sessionId, workspaceRootPath) {
      return withCheckpointMaintenance(() =>
        removeSessionCheckpoints({
          sessionId,
          workspaceRootPath,
          repository: options.repository,
          filesystemAdapter,
          gitAdapter,
          blobStore,
        }),
      );
    },

    reconcile(workspaceRootPaths) {
      return withCheckpointMaintenance(() =>
        reconcileCheckpoints({
          repository: options.repository,
          filesystemAdapter,
          gitAdapter,
          blobStore,
          workspaceRootPaths,
        }),
      );
    },
  };
}
