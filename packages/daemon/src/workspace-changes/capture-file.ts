import { readFile, stat } from "node:fs/promises";
import type { PutBlobResult } from "./blob-store";
import { hashBuffer, hashFile, MAX_CHECKPOINT_FILE_BYTES } from "./hash";

export interface CaptureFileIo {
  stat(filePath: string): Promise<{ size: number; mtimeMs: number }>;
  readFile(filePath: string): Promise<Buffer>;
  hashFile(filePath: string): Promise<{ hash: string; size: number }>;
}

export interface CaptureFileResult {
  hash: string;
  size: number;
  stored: boolean;
  newlyAllocatedBytes: number;
  reason?: "too-large" | "quota" | "concurrent-modification";
  bytes?: Buffer;
}

const defaultIo: CaptureFileIo = {
  async stat(filePath) {
    const fileStat = await stat(filePath);
    return { size: fileStat.size, mtimeMs: fileStat.mtimeMs };
  },
  readFile,
  hashFile,
};

export async function captureWorkspaceFile(
  filePath: string,
  options: {
    maxFileBytes?: number;
    maxAttempts?: number;
    put(bytes: Buffer): Promise<PutBlobResult | string>;
    has?(hash: string): Promise<boolean>;
    io?: CaptureFileIo;
  },
): Promise<CaptureFileResult> {
  const io = options.io ?? defaultIo;
  const maxFileBytes = options.maxFileBytes ?? MAX_CHECKPOINT_FILE_BYTES;
  const maxAttempts = options.maxAttempts ?? 3;

  let lastHash: string | null = null;
  let lastSize = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const before = await io.stat(filePath);
    lastSize = before.size;
    if (before.size > maxFileBytes) {
      const hashed = await io.hashFile(filePath);
      const after = await io.stat(filePath);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        lastHash = hashed.hash;
        continue;
      }
      return {
        hash: hashed.hash,
        size: hashed.size,
        stored: false,
        newlyAllocatedBytes: 0,
        reason: "too-large",
      };
    }

    const bytes = await io.readFile(filePath);
    const after = await io.stat(filePath);
    const hash = hashBuffer(bytes);
    lastHash = hash;
    lastSize = bytes.byteLength;
    if (
      after.size !== bytes.byteLength ||
      after.mtimeMs !== before.mtimeMs ||
      after.size !== before.size
    ) {
      continue;
    }
    if (options.has && (await options.has(hash))) {
      return {
        hash,
        size: bytes.byteLength,
        stored: true,
        newlyAllocatedBytes: 0,
        bytes,
      };
    }
    const putResult = normalizePutResult(await options.put(bytes), hash);
    return {
      hash: putResult.hash,
      size: bytes.byteLength,
      stored: putResult.stored,
      newlyAllocatedBytes: putResult.newlyAllocatedBytes,
      reason: putResult.reason,
      bytes,
    };
  }

  return {
    hash: lastHash ?? hashBuffer(""),
    size: lastSize,
    stored: false,
    newlyAllocatedBytes: 0,
    reason: "concurrent-modification",
  };
}

function normalizePutResult(
  result: PutBlobResult | string,
  fallbackHash: string,
): PutBlobResult {
  if (typeof result === "string") {
    return { hash: result, stored: true, newlyAllocatedBytes: 0 };
  }
  return {
    hash: result.hash || fallbackHash,
    stored: result.stored,
    newlyAllocatedBytes: result.newlyAllocatedBytes,
    reason: result.reason,
  };
}
