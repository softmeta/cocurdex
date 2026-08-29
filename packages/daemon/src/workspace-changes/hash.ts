import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

/** Largest file Cocurdex stores or restores byte-for-byte. */
export const MAX_CHECKPOINT_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Total filesystem blob-store cap across all checkpoints in user data.
 * Git checkpoints live in the workspace object database and use the per-file
 * cap for restore, not this store quota.
 */
export const MAX_CHECKPOINT_TOTAL_BYTES = 512 * 1024 * 1024;

/** Maximum changed working-tree content captured by one hidden Git commit. */
export const MAX_GIT_CHECKPOINT_CHANGED_BYTES = 128 * 1024 * 1024;

export const MAX_REVIEW_TEXT_BYTES = 1_000_000;

/** Undo checkpoints expire after this age and are also count-bounded. */
export const CHECKPOINT_RETENTION_DAYS = 30;
export const MAX_RETAINED_CHECKPOINTS_PER_SESSION = 100;
export const MAX_RETAINED_CHECKPOINTS_TOTAL = 500;

/** Recovery snapshots expire sooner because they only protect undo retries. */
export const RECOVERY_CHECKPOINT_RETENTION_DAYS = 7;

export function hashBuffer(buffer: Buffer | Uint8Array | string) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function hashFile(filePath: string) {
  const fileStat = await stat(filePath);
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return { hash: hash.digest("hex"), size: fileStat.size };
}
