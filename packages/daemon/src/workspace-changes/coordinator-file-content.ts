import type {
  HostCheckpointKind,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
  TurnChangeSet,
} from "@cocurdex/shared";
import { mimeTypeForPath } from "@cocurdex/shared";
import type { HostCheckpoint, HostCheckpointAdapter } from "./checkpoint";
import { MAX_REVIEW_TEXT_BYTES } from "./hash";
import { sanitizeTurnFileChange } from "./path-safety";

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
  const bytes = checkpoint
    ? await adapter.readFile(checkpoint, relativePath)
    : null;
  const text =
    bytes &&
    file.reviewKind === "text" &&
    bytes.byteLength <= MAX_REVIEW_TEXT_BYTES
      ? bytes.toString("utf8")
      : null;
  return {
    path: file.path,
    side: input.side,
    reviewKind: file.reviewKind,
    exists: bytes != null,
    sizeBytes: bytes?.byteLength ?? null,
    hash:
      input.side === "before"
        ? (file.beforeHash ?? null)
        : (file.afterHash ?? null),
    text,
    contentBase64:
      bytes && file.reviewKind !== "text" ? bytes.toString("base64") : null,
    mimeType: mimeTypeForPath(file.path),
  };
}
