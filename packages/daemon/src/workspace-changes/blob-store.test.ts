import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCheckpointBlobStore,
  getTurnWorkspaceChangesRoot,
} from "./blob-store";
import { hashBuffer } from "./hash";

describe("checkpoint blob store", () => {
  it("counts identical content only once", async () => {
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-blobs-"));
    const store = createCheckpointBlobStore(userData);
    const bytes = Buffer.from("shared-bytes");
    const first = await store.put(bytes);
    const second = await store.put(bytes);
    expect(first.stored).toBe(true);
    expect(first.newlyAllocatedBytes).toBe(bytes.byteLength);
    expect(second.stored).toBe(true);
    expect(second.newlyAllocatedBytes).toBe(0);
    expect(await store.usage()).toBe(bytes.byteLength);
  });

  it("allocates concurrent duplicate writes only once", async () => {
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-blobs-"));
    const store = createCheckpointBlobStore(userData);
    const bytes = Buffer.from("race-bytes");
    const results = await Promise.all([store.put(bytes), store.put(bytes)]);
    const allocated = results.reduce(
      (sum, result) => sum + result.newlyAllocatedBytes,
      0,
    );
    expect(allocated).toBe(bytes.byteLength);
    expect(results.every((result) => result.hash === hashBuffer(bytes))).toBe(
      true,
    );
    expect(await store.usage()).toBe(bytes.byteLength);
  });

  it("rejects and repairs a truncated blob at a content-addressed path", async () => {
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-blobs-"));
    const store = createCheckpointBlobStore(userData);
    const bytes = Buffer.from("complete-checkpoint-content");
    const hash = hashBuffer(bytes);
    const blobPath = path.join(
      getTurnWorkspaceChangesRoot(userData),
      "blobs",
      hash.slice(0, 2),
      hash,
    );
    await mkdir(path.dirname(blobPath), { recursive: true });
    await writeFile(blobPath, bytes.subarray(0, 4));

    expect(await store.has(hash)).toBe(false);
    expect(await store.put(bytes)).toMatchObject({
      hash,
      stored: true,
      newlyAllocatedBytes: bytes.byteLength,
    });
    expect(await store.get(hash)).toEqual(bytes);
  });
});
