import type { AgentSession } from "@cocurdex/agent-core";
import type {
  NativeWorkspaceRewindResult,
  TurnChangeSet,
  TurnFileChange,
} from "@cocurdex/shared";
import { nativeMatchesHostTransition } from "@cocurdex/shared";

export function nativeRewindCoversTransition(
  changeSet: TurnChangeSet,
  preview: NativeWorkspaceRewindResult,
  nativeFiles?: TurnFileChange[] | null,
) {
  if (!preview.canRewind) {
    return false;
  }
  if ((preview.skippedLinks ?? 0) > 0) {
    return false;
  }
  const previewPaths = new Set(preview.filesChanged ?? []);
  if (previewPaths.size === 0 || previewPaths.size !== changeSet.files.length) {
    return false;
  }
  for (const file of changeSet.files) {
    if (!previewPaths.has(file.path)) {
      return false;
    }
  }
  if (!nativeFiles || nativeFiles.length === 0) {
    return false;
  }
  const nativeByPath = new Map(nativeFiles.map((file) => [file.path, file]));
  for (const file of changeSet.files) {
    const native = nativeByPath.get(file.path);
    if (!native || !nativeMatchesHostTransition(native, file)) {
      return false;
    }
  }
  return true;
}

export async function tryNativeRewind(
  session: AgentSession | null,
  changeSet: TurnChangeSet,
  nativeFiles?: TurnFileChange[] | null,
  onBeforeMutate?: () => void,
): Promise<{ attempted: boolean; used: boolean }> {
  if (
    !session?.rewindNativeWorkspaceChanges ||
    !changeSet.nativeCheckpointRef
  ) {
    return { attempted: false, used: false };
  }
  const capabilities = session.getWorkspaceChangeCapabilities?.();
  if (capabilities?.fileRewind !== "native") {
    return { attempted: false, used: false };
  }
  let preview: NativeWorkspaceRewindResult;
  try {
    preview = await session.rewindNativeWorkspaceChanges({
      nativeCheckpointRef: changeSet.nativeCheckpointRef,
      dryRun: true,
    });
  } catch {
    return { attempted: false, used: false };
  }
  if (!nativeRewindCoversTransition(changeSet, preview, nativeFiles)) {
    return { attempted: false, used: false };
  }
  onBeforeMutate?.();
  const result = await session.rewindNativeWorkspaceChanges({
    nativeCheckpointRef: changeSet.nativeCheckpointRef,
  });
  if (!result.canRewind || (result.skippedLinks ?? 0) > 0) {
    throw new Error(
      result.error ?? "Native rewind did not restore the complete selection",
    );
  }
  return { attempted: true, used: true };
}
