import { rm } from "node:fs/promises";
import path from "node:path";
import {
  type ContentAddressedStore,
  createContentAddressedStore,
} from "../content-addressed-store";
import { MAX_CHECKPOINT_FILE_BYTES, MAX_CHECKPOINT_TOTAL_BYTES } from "./hash";

export type { PutBlobResult } from "../content-addressed-store";

export type CheckpointBlobStore = ContentAddressedStore;

export function getTurnWorkspaceChangesRoot(userDataPath: string) {
  return path.join(userDataPath, "turn-workspace-changes");
}

export function createCheckpointBlobStore(
  userDataPath: string,
): CheckpointBlobStore {
  return createContentAddressedStore(
    path.join(getTurnWorkspaceChangesRoot(userDataPath), "blobs"),
    {
      maxFileBytes: MAX_CHECKPOINT_FILE_BYTES,
      maxTotalBytes: MAX_CHECKPOINT_TOTAL_BYTES,
    },
  );
}

export async function removeCheckpointStore(userDataPath: string) {
  await rm(getTurnWorkspaceChangesRoot(userDataPath), {
    force: true,
    recursive: true,
  });
}
