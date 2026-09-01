import { readFile } from "node:fs/promises";
import type { AgentSession } from "@cocurdex/agent-core";
import type {
  NativeWorkspaceChangeEvidence,
  TurnChangeOutcome,
  TurnChangeSet,
  TurnFileChange,
} from "@cocurdex/shared";
import {
  applyContentLineStats,
  mergeNativeAndHostEvidence,
  selectChangeSetCoverage,
  selectChangeSetSource,
  sumFileStats,
} from "@cocurdex/shared";
import type { HostCheckpoint, HostCheckpointAdapter } from "./checkpoint";
import { resolveWorkspacePath, sanitizeTurnFileChanges } from "./path-safety";

export interface ActiveTurn {
  workspaceRootPath: string;
  adapter: HostCheckpointAdapter;
  native: NativeWorkspaceChangeEvidence | null;
  before: HostCheckpoint | null;
  changeSet: TurnChangeSet;
  // A turn can only touch the workspace through a tool call. Turns that ran
  // none (plain chat) skip the "after" capture and leave no change set behind.
  touchedWorkspace?: boolean;
  finalized?: boolean;
}

export async function completeActiveTurn(input: {
  active: ActiveTurn;
  messageId?: string;
  outcome: TurnChangeOutcome;
  getNativeSession?(sessionId: string): AgentSession | null;
  now(): string;
  persist(changeSet: TurnChangeSet): Promise<TurnChangeSet>;
  discard(
    active: ActiveTurn,
    checkpoints: (HostCheckpoint | null)[],
  ): Promise<TurnChangeSet>;
  rememberCheckpoint(checkpoint: HostCheckpoint | null): void;
}): Promise<TurnChangeSet> {
  const { active } = input;
  if (input.messageId) {
    active.changeSet = {
      ...active.changeSet,
      messageId: input.messageId,
    };
  }

  if (!active.touchedWorkspace && !active.native) {
    return input.discard(active, [active.before]);
  }

  const session = input.getNativeSession?.(active.changeSet.sessionId) ?? null;
  try {
    const collected = await session?.collectNativeWorkspaceChanges?.({
      userMessageId: active.changeSet.userMessageId,
      providerTurnId: active.changeSet.providerTurnId,
    });
    if (collected) {
      active.native = collected;
    }
  } catch {
    if (!active.native) {
      active.native = null;
    }
  }
  if (active.native) {
    active.native = {
      ...active.native,
      files: sanitizeTurnFileChanges(active.native.files),
    };
  }

  let after: HostCheckpoint | null = null;
  let hostFiles: TurnFileChange[] = [];
  if (active.before) {
    try {
      after = await active.adapter.capture({
        workspaceRootPath: active.workspaceRootPath,
        sessionId: active.changeSet.sessionId,
        userMessageId: active.changeSet.userMessageId,
        phase: "after",
      });
      input.rememberCheckpoint(after);
      hostFiles = sanitizeTurnFileChanges(
        await active.adapter.diff(active.before, after),
      );
    } catch {
      after = null;
      hostFiles = [];
    }
  }

  const hostAvailable = after != null && active.before != null;
  const files = await fillMissingLineStats({
    adapter: active.adapter,
    after,
    before: active.before,
    files: mergeNativeAndHostEvidence(
      active.native?.files,
      hostFiles,
      hostAvailable,
    ),
    workspaceRootPath: active.workspaceRootPath,
  });
  if (files.length === 0) {
    return input.discard(active, [active.before, after]);
  }

  const stats = sumFileStats(files);
  const timestamp = input.now();
  active.changeSet = {
    ...active.changeSet,
    source: selectChangeSetSource(active.native, active.adapter.kind),
    coverage: selectChangeSetCoverage(active.native, hostAvailable),
    files,
    additions: stats.additions ?? active.native?.additions ?? null,
    deletions: stats.deletions ?? active.native?.deletions ?? null,
    providerTurnId:
      active.native?.providerTurnId ?? active.changeSet.providerTurnId,
    nativeCheckpointRef:
      active.native?.nativeCheckpointRef ??
      active.changeSet.nativeCheckpointRef,
    hostBeforeCheckpointRef: active.before?.ref ?? null,
    hostBeforeCheckpointKind: active.before?.kind ?? null,
    hostAfterCheckpointRef: after?.ref ?? null,
    hostAfterCheckpointKind: after?.kind ?? null,
    outcome: input.outcome,
    nativeFiles: active.native?.files ?? null,
    undoable:
      hostAvailable &&
      files.length > 0 &&
      files.every((file) => file.restorable !== false),
    status: hostAvailable ? "ready" : "partial",
    updatedAt: timestamp,
  };
  return input.persist(active.changeSet);
}

async function fillMissingLineStats(input: {
  adapter: HostCheckpointAdapter;
  after: HostCheckpoint | null;
  before: HostCheckpoint | null;
  files: TurnFileChange[];
  workspaceRootPath: string;
}) {
  return Promise.all(
    input.files.map(async (file) => {
      if (
        file.reviewKind !== "text" ||
        (typeof file.additions === "number" &&
          typeof file.deletions === "number")
      ) {
        return file;
      }

      return applyContentLineStats(
        file,
        await readBeforeText(input, file),
        await readAfterText(input, file),
      );
    }),
  );
}

async function readBeforeText(
  input: {
    adapter: HostCheckpointAdapter;
    before: HostCheckpoint | null;
  },
  file: TurnFileChange,
) {
  if (file.operation === "add") {
    return "";
  }
  if (!input.before) {
    return null;
  }
  return readCheckpointText(
    input.adapter,
    input.before,
    file.previousPath ?? file.path,
  );
}

async function readAfterText(
  input: {
    adapter: HostCheckpointAdapter;
    after: HostCheckpoint | null;
    workspaceRootPath: string;
  },
  file: TurnFileChange,
) {
  if (file.operation === "delete") {
    return "";
  }
  if (input.after) {
    return readCheckpointText(input.adapter, input.after, file.path);
  }
  return readWorkingTreeText(input.workspaceRootPath, file.path);
}

async function readCheckpointText(
  adapter: HostCheckpointAdapter,
  checkpoint: HostCheckpoint,
  relativePath: string,
) {
  const bytes = await adapter.readFile(checkpoint, relativePath);
  return bytes ? bytes.toString("utf8") : null;
}

async function readWorkingTreeText(
  workspaceRootPath: string,
  relativePath: string,
) {
  try {
    const { absolute } = resolveWorkspacePath(workspaceRootPath, relativePath);
    return await readFile(absolute, "utf8");
  } catch {
    return null;
  }
}
