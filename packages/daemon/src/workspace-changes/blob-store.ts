import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import {
  hashBuffer,
  MAX_CHECKPOINT_FILE_BYTES,
  MAX_CHECKPOINT_TOTAL_BYTES,
} from "./hash";

export function getTurnWorkspaceChangesRoot(userDataPath: string) {
  return path.join(userDataPath, "turn-workspace-changes");
}

export interface PutBlobResult {
  hash: string;
  stored: boolean;
  newlyAllocatedBytes: number;
  reason?: "quota" | "too-large";
}

export interface CheckpointBlobStore {
  put(bytes: Buffer): Promise<PutBlobResult>;
  get(hash: string): Promise<Buffer | null>;
  has(hash: string): Promise<boolean>;
  usage(): Promise<number>;
  listHashes(): Promise<string[]>;
  gc(keep: Set<string>): Promise<void>;
}

export function createCheckpointBlobStore(
  userDataPath: string,
): CheckpointBlobStore {
  const root = path.join(getTurnWorkspaceChangesRoot(userDataPath), "blobs");
  let writeChain = Promise.resolve();

  function enqueueWrite<T>(operation: () => Promise<T>) {
    const queued = writeChain.then(operation, operation);
    writeChain = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  function blobPath(hash: string) {
    return path.join(root, hash.slice(0, 2), hash);
  }

  async function listHashes() {
    const prefixes = await readdir(root, { withFileTypes: true }).catch(
      () => [],
    );
    const hashes: string[] = [];
    for (const prefix of prefixes) {
      if (!prefix.isDirectory()) {
        continue;
      }
      const files = await readdir(path.join(root, prefix.name)).catch(() => []);
      for (const file of files) {
        if (/^[a-f0-9]{64}$/.test(file)) {
          hashes.push(file);
        }
      }
    }
    return hashes;
  }

  async function usage() {
    const hashes = await listHashes();
    let total = 0;
    for (const hash of hashes) {
      const fileStat = await stat(blobPath(hash)).catch(() => null);
      if (fileStat) {
        total += fileStat.size;
      }
    }
    return total;
  }

  async function has(hash: string) {
    const bytes = await readFile(blobPath(hash)).catch(() => null);
    return bytes != null && hashBuffer(bytes) === hash;
  }

  async function writeBlobAtomically(target: string, bytes: Buffer) {
    const tempPath = `${target}.${randomUUID()}.tmp`;
    try {
      const handle = await open(tempPath, "wx");
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await rename(tempPath, target);
      } catch (error) {
        if (
          process.platform !== "win32" ||
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          (error.code !== "EEXIST" && error.code !== "EPERM")
        ) {
          throw error;
        }
        await rm(target, { force: true });
        await rename(tempPath, target);
      }
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  async function putExclusive(bytes: Buffer): Promise<PutBlobResult> {
    if (bytes.byteLength > MAX_CHECKPOINT_FILE_BYTES) {
      return {
        hash: hashBuffer(bytes),
        stored: false,
        newlyAllocatedBytes: 0,
        reason: "too-large",
      };
    }
    const hash = hashBuffer(bytes);
    const target = blobPath(hash);
    if (await has(hash)) {
      return { hash, stored: true, newlyAllocatedBytes: 0 };
    }
    const currentUsage = await usage();
    if (currentUsage + bytes.byteLength > MAX_CHECKPOINT_TOTAL_BYTES) {
      return {
        hash,
        stored: false,
        newlyAllocatedBytes: 0,
        reason: "quota",
      };
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeBlobAtomically(target, bytes);
    return { hash, stored: true, newlyAllocatedBytes: bytes.byteLength };
  }

  return {
    put(bytes) {
      return enqueueWrite(() => putExclusive(bytes));
    },
    async get(hash) {
      const bytes = await readFile(blobPath(hash)).catch(() => null);
      return bytes != null && hashBuffer(bytes) === hash ? bytes : null;
    },
    has,
    usage,
    listHashes,
    gc(keep) {
      return enqueueWrite(async () => {
        const hashes = await listHashes();
        for (const hash of hashes) {
          if (keep.has(hash)) {
            continue;
          }
          await rm(blobPath(hash), { force: true });
        }
      });
    },
  };
}

export async function removeCheckpointStore(userDataPath: string) {
  await rm(getTurnWorkspaceChangesRoot(userDataPath), {
    force: true,
    recursive: true,
  });
}
