import { describe, expect, it } from "vitest";
import { captureWorkspaceFile } from "./capture-file";
import { hashBuffer } from "./hash";

describe("captureWorkspaceFile", () => {
  it("hashes the exact stored buffer", async () => {
    const bytes = Buffer.from("stable-bytes");
    const stored: Buffer[] = [];
    const result = await captureWorkspaceFile("notes.md", {
      put: async (payload) => {
        stored.push(payload);
        return {
          hash: hashBuffer(payload),
          stored: true,
          newlyAllocatedBytes: payload.byteLength,
        };
      },
      io: {
        async stat() {
          return { size: bytes.byteLength, mtimeMs: 1 };
        },
        async readFile() {
          return bytes;
        },
        async hashFile() {
          return { hash: hashBuffer(bytes), size: bytes.byteLength };
        },
      },
    });

    expect(result.stored).toBe(true);
    expect(result.hash).toBe(hashBuffer(bytes));
    expect(stored).toEqual([bytes]);
  });

  it("does not store files above the per-file limit", async () => {
    const bytes = Buffer.from("too-big");
    const result = await captureWorkspaceFile("large.bin", {
      maxFileBytes: 3,
      put: async () => {
        throw new Error("should not store");
      },
      io: {
        async stat() {
          return { size: bytes.byteLength, mtimeMs: 1 };
        },
        async readFile() {
          return bytes;
        },
        async hashFile() {
          return { hash: hashBuffer(bytes), size: bytes.byteLength };
        },
      },
    });

    expect(result).toMatchObject({
      stored: false,
      reason: "too-large",
      hash: hashBuffer(bytes),
    });
  });

  it("keeps an existing blob stored when quota would reject a new write", async () => {
    const bytes = Buffer.from("already-there");
    const hash = hashBuffer(bytes);
    const result = await captureWorkspaceFile("notes.md", {
      has: async () => true,
      put: async () => {
        throw new Error("should not write a duplicate blob");
      },
      io: {
        async stat() {
          return { size: bytes.byteLength, mtimeMs: 1 };
        },
        async readFile() {
          return bytes;
        },
        async hashFile() {
          return { hash, size: bytes.byteLength };
        },
      },
    });
    expect(result).toMatchObject({
      stored: true,
      newlyAllocatedBytes: 0,
      hash,
    });
  });

  it("does not store files that would exceed the remaining quota", async () => {
    const bytes = Buffer.from("quota");
    const result = await captureWorkspaceFile("notes.md", {
      put: async () => ({
        hash: hashBuffer(bytes),
        stored: false,
        newlyAllocatedBytes: 0,
        reason: "quota",
      }),
      io: {
        async stat() {
          return { size: bytes.byteLength, mtimeMs: 1 };
        },
        async readFile() {
          return bytes;
        },
        async hashFile() {
          return { hash: hashBuffer(bytes), size: bytes.byteLength };
        },
      },
    });
    expect(result).toMatchObject({ stored: false, reason: "quota" });
  });

  it("retries concurrent mutation and fails clearly if it persists", async () => {
    let reads = 0;
    const result = await captureWorkspaceFile("changing.bin", {
      maxAttempts: 2,
      put: async () => ({
        hash: "unused",
        stored: true,
        newlyAllocatedBytes: 4,
      }),
      io: {
        async stat() {
          return { size: 4, mtimeMs: reads };
        },
        async readFile() {
          reads += 1;
          return Buffer.from(`v${reads}xx`);
        },
        async hashFile() {
          return { hash: "ignored", size: 4 };
        },
      },
    });

    expect(result.stored).toBe(false);
    expect(result.reason).toBe("concurrent-modification");
  });
});
