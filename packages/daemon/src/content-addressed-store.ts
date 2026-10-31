import { createHash, randomUUID } from "node:crypto";
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

export interface PutBlobResult {
  hash: string;
  stored: boolean;
  newlyAllocatedBytes: number;
  reason?: "quota" | "too-large";
}

export interface ContentAddressedStore {
  put(bytes: Buffer): Promise<PutBlobResult>;
  get(hash: string): Promise<Buffer | null>;
  has(hash: string): Promise<boolean>;
  locate(hash: string): Promise<{ path: string; size: number } | null>;
  usage(): Promise<number>;
  listHashes(): Promise<string[]>;
  gc(keep: Set<string>, options?: { minAgeMs?: number }): Promise<number>;
}

export interface ContentAddressedStoreLimits {
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;

export function hashBytes(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
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

export function createContentAddressedStore(
  root: string,
  limits: ContentAddressedStoreLimits = {},
): ContentAddressedStore {
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
        if (HASH_PATTERN.test(file)) {
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
    return bytes != null && hashBytes(bytes) === hash;
  }

  async function putExclusive(bytes: Buffer): Promise<PutBlobResult> {
    const hash = hashBytes(bytes);
    if (
      limits.maxFileBytes !== undefined &&
      bytes.byteLength > limits.maxFileBytes
    ) {
      return {
        hash,
        stored: false,
        newlyAllocatedBytes: 0,
        reason: "too-large",
      };
    }
    if (await has(hash)) {
      return { hash, stored: true, newlyAllocatedBytes: 0 };
    }
    if (limits.maxTotalBytes !== undefined) {
      const currentUsage = await usage();
      if (currentUsage + bytes.byteLength > limits.maxTotalBytes) {
        return { hash, stored: false, newlyAllocatedBytes: 0, reason: "quota" };
      }
    }
    const target = blobPath(hash);
    await mkdir(path.dirname(target), { recursive: true });
    await writeBlobAtomically(target, bytes);
    return { hash, stored: true, newlyAllocatedBytes: bytes.byteLength };
  }

  return {
    put(bytes) {
      return enqueueWrite(() => putExclusive(bytes));
    },
    async get(hash) {
      if (!HASH_PATTERN.test(hash)) {
        return null;
      }
      const bytes = await readFile(blobPath(hash)).catch(() => null);
      return bytes != null && hashBytes(bytes) === hash ? bytes : null;
    },
    has,
    async locate(hash) {
      if (!HASH_PATTERN.test(hash)) {
        return null;
      }
      const target = blobPath(hash);
      const fileStat = await stat(target).catch(() => null);
      return fileStat?.isFile() ? { path: target, size: fileStat.size } : null;
    },
    usage,
    listHashes,
    gc(keep, options = {}) {
      return enqueueWrite(async () => {
        const cutoff = Date.now() - (options.minAgeMs ?? 0);
        let removed = 0;
        for (const hash of await listHashes()) {
          if (keep.has(hash)) {
            continue;
          }
          const target = blobPath(hash);
          if (options.minAgeMs) {
            const fileStat = await stat(target).catch(() => null);
            if (!fileStat || fileStat.mtimeMs > cutoff) {
              continue;
            }
          }
          await rm(target, { force: true });
          removed += 1;
        }
        return removed;
      });
    },
  };
}
