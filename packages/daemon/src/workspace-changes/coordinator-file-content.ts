import { readFile, stat } from "node:fs/promises";
import type {
  HostCheckpointKind,
  TurnChangeDiff,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
  TurnChangeSet,
  TurnFileChange,
} from "@cocurdex/shared";
import {
  buildTurnChangeDiffFile,
  createUnifiedDiff,
  mimeTypeForPath,
} from "@cocurdex/shared";
import type { HostCheckpoint, HostCheckpointAdapter } from "./checkpoint";
import { MAX_CHECKPOINT_FILE_BYTES, MAX_REVIEW_TEXT_BYTES } from "./hash";
import { mapWithConcurrency } from "./map-with-concurrency";
import { resolveWorkspacePath, sanitizeTurnFileChange } from "./path-safety";

const TURN_DIFF_FILE_CONCURRENCY = 8;

export function resolveHostCheckpoint(
  ref: string | null | undefined,
  kind: HostCheckpointKind | null | undefined,
  adapter: HostCheckpointAdapter,
  workspaceRootPath: string,
  known: Map<string, HostCheckpoint>,
): HostCheckpoint | null {
  if (!ref) {
    return null;
  }
  const recorded = known.get(ref);
  if (recorded) {
    if (kind && recorded.kind !== kind) {
      return null;
    }
    return recorded;
  }
  const resolvedKind = kind ?? adapter.kind;
  if (kind && adapter.kind !== kind) {
    return null;
  }
  return {
    id: ref,
    kind: resolvedKind,
    ref,
    workspaceRootPath,
  };
}

function buildFileContent(input: {
  file: TurnFileChange;
  side: TurnChangeFileContent["side"];
  bytes: Buffer | null;
  sizeBytes: number | null;
  exists?: boolean;
}): TurnChangeFileContent {
  const { file, side, bytes } = input;
  const text =
    bytes &&
    file.reviewKind === "text" &&
    bytes.byteLength <= MAX_REVIEW_TEXT_BYTES
      ? bytes.toString("utf8")
      : null;
  return {
    path: file.path,
    side,
    reviewKind: file.reviewKind,
    exists: input.exists ?? (bytes != null || input.sizeBytes != null),
    sizeBytes: bytes?.byteLength ?? input.sizeBytes ?? null,
    hash:
      side === "before" ? (file.beforeHash ?? null) : (file.afterHash ?? null),
    text,
    contentBase64:
      bytes && file.reviewKind !== "text" ? bytes.toString("base64") : null,
    mimeType: mimeTypeForPath(file.path),
  };
}

async function readWorkspaceFileBytes(workspaceRootPath: string, path: string) {
  try {
    const { absolute } = resolveWorkspacePath(workspaceRootPath, path);
    const info = await stat(absolute);
    if (!info.isFile() || info.size > MAX_CHECKPOINT_FILE_BYTES) {
      return null;
    }
    return await readFile(absolute);
  } catch {
    return null;
  }
}

async function matchesRecordedPatch(input: {
  changeSet: TurnChangeSet;
  file: TurnFileChange;
  bytes: Buffer;
  workspaceRootPath: string;
  adapter: HostCheckpointAdapter;
  known: Map<string, HostCheckpoint>;
}) {
  const { changeSet, file, bytes } = input;
  if (!file.patch) {
    return false;
  }
  const before = resolveHostCheckpoint(
    changeSet.hostBeforeCheckpointRef,
    changeSet.hostBeforeCheckpointKind,
    input.adapter,
    input.workspaceRootPath,
    input.known,
  );
  const beforeBytes = before
    ? await input.adapter.readFile(before, file.previousPath ?? file.path)
    : null;
  const beforeText = beforeBytes ? beforeBytes.toString("utf8") : "";
  return (
    createUnifiedDiff(file.path, beforeText, bytes.toString("utf8")).patch ===
    file.patch
  );
}

async function readVerifiedWorkingTreeAfterContent(input: {
  changeSet: TurnChangeSet;
  file: TurnFileChange;
  workspaceRootPath: string;
  adapter: HostCheckpointAdapter;
  known: Map<string, HostCheckpoint>;
}): Promise<TurnChangeFileContent> {
  const { file, workspaceRootPath } = input;
  if (file.operation === "delete") {
    return buildFileContent({
      file,
      side: "after",
      bytes: null,
      sizeBytes: null,
    });
  }
  const bytes = await readWorkspaceFileBytes(workspaceRootPath, file.path);
  const unavailable = () =>
    buildFileContent({
      file,
      side: "after",
      bytes: null,
      sizeBytes: file.afterSize ?? null,
      exists: true,
    });
  if (!bytes) {
    return unavailable();
  }
  if (file.afterHash) {
    const hash = await input.adapter.hashWorkingTreeFile(
      workspaceRootPath,
      file.path,
    );
    if (hash !== file.afterHash) {
      return unavailable();
    }
  } else if (!(await matchesRecordedPatch({ ...input, bytes }))) {
    return unavailable();
  }
  return buildFileContent({
    file,
    side: "after",
    bytes,
    sizeBytes: bytes.byteLength,
  });
}

export async function readTurnChangeFileContent(
  changeSet: TurnChangeSet,
  input: TurnChangeFileContentRequest & { workspaceRootPath: string },
  adapter: HostCheckpointAdapter,
  known: Map<string, HostCheckpoint>,
): Promise<TurnChangeFileContent> {
  const requested = sanitizeTurnFileChange({
    path: input.path,
    operation: "modify",
    reviewKind: "text",
  });
  if (!requested) {
    throw new Error(`Changed file ${input.path} was not found`);
  }
  const file = changeSet.files.find((entry) => entry.path === requested.path);
  if (!file) {
    throw new Error(`Changed file ${input.path} was not found`);
  }
  if (input.side === "after" && !changeSet.hostAfterCheckpointRef) {
    return readVerifiedWorkingTreeAfterContent({
      changeSet,
      file,
      workspaceRootPath: input.workspaceRootPath,
      adapter,
      known,
    });
  }
  const checkpointRef =
    input.side === "before"
      ? changeSet.hostBeforeCheckpointRef
      : changeSet.hostAfterCheckpointRef;
  const checkpointKind =
    input.side === "before"
      ? changeSet.hostBeforeCheckpointKind
      : changeSet.hostAfterCheckpointKind;
  const checkpoint = resolveHostCheckpoint(
    checkpointRef,
    checkpointKind,
    adapter,
    input.workspaceRootPath,
    known,
  );
  const relativePath =
    input.side === "before" && file.previousPath
      ? file.previousPath
      : file.path;
  const recordedSize =
    input.side === "before" ? file.beforeSize : file.afterSize;
  const bytes = checkpoint
    ? await adapter.readFile(checkpoint, relativePath)
    : null;
  return buildFileContent({
    file,
    side: input.side,
    bytes,
    sizeBytes: recordedSize ?? null,
  });
}

export async function readTurnChangeDiff(
  changeSet: TurnChangeSet,
  input: { workspaceRootPath: string },
  adapter: HostCheckpointAdapter,
  known: Map<string, HostCheckpoint>,
): Promise<TurnChangeDiff> {
  if (!changeSet.hostBeforeCheckpointRef && !changeSet.hostAfterCheckpointRef) {
    return { status: "expired", files: [] };
  }
  if (!changeSet.hostBeforeCheckpointRef) {
    return { status: "missing", files: [] };
  }
  const files = await mapWithConcurrency(
    changeSet.files,
    TURN_DIFF_FILE_CONCURRENCY,
    async (file) => {
      const [before, after] = await Promise.all([
        readTurnChangeFileContent(
          changeSet,
          {
            sessionId: changeSet.sessionId,
            messageId: changeSet.messageId || changeSet.userMessageId,
            path: file.path,
            side: "before",
            workspaceRootPath: input.workspaceRootPath,
          },
          adapter,
          known,
        ),
        readTurnChangeFileContent(
          changeSet,
          {
            sessionId: changeSet.sessionId,
            messageId: changeSet.messageId || changeSet.userMessageId,
            path: file.path,
            side: "after",
            workspaceRootPath: input.workspaceRootPath,
          },
          adapter,
          known,
        ),
      ]);
      return buildTurnChangeDiffFile(
        file,
        before,
        after,
        MAX_REVIEW_TEXT_BYTES,
      );
    },
  );
  return { status: "ok", files };
}
