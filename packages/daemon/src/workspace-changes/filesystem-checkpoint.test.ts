import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCheckpointBlobStore } from "./blob-store";
import { createFilesystemCheckpointAdapter } from "./filesystem-checkpoint";

async function createWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-checkpoint-"));
  await mkdir(path.join(root, "notes"), { recursive: true });
  await writeFile(path.join(root, "notes/a.md"), "one\n", "utf8");
  await writeFile(path.join(root, "notes/old.md"), "moved\n", "utf8");
  await writeFile(path.join(root, "notes/~$lock.docx"), "lock", "utf8");
  return root;
}

describe("filesystem checkpoint adapter", () => {
  it("diffs add, modify, delete, and rename and skips Office lock files", async () => {
    const workspace = await createWorkspace();
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-store-"));
    const adapter = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );

    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });

    await writeFile(path.join(workspace, "notes/a.md"), "two\n", "utf8");
    await mkdir(path.join(workspace, "docs"), { recursive: true });
    const { rename, rm } = await import("node:fs/promises");
    await rename(
      path.join(workspace, "notes/old.md"),
      path.join(workspace, "docs/renamed.md"),
    );
    await rm(path.join(workspace, "notes/~$lock.docx"), { force: true });

    const after = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "after",
    });
    const files = await adapter.diff(before, after);

    expect(files.find((file) => file.path.includes("~$"))).toBeUndefined();
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "notes/a.md", operation: "modify" }),
        expect.objectContaining({
          path: "docs/renamed.md",
          operation: "rename",
          previousPath: "notes/old.md",
        }),
      ]),
    );
  });

  it("still sees a same-size edit across three cached captures", async () => {
    // Captures reuse the previous manifest as a stat cache; a stale entry
    // would hide an edit that keeps the file size.
    const workspace = await createWorkspace();
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-store-"));
    const adapter = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );
    const capture = (phase: "before" | "after") =>
      adapter.capture({
        workspaceRootPath: workspace,
        sessionId: "session-1",
        userMessageId: `user-${phase}`,
        phase,
      });

    await capture("before");
    const before = await capture("before");
    await writeFile(path.join(workspace, "notes/a.md"), "two\n", "utf8");
    const after = await capture("after");

    expect(await adapter.diff(before, after)).toEqual([
      expect.objectContaining({ path: "notes/a.md", operation: "modify" }),
    ]);
  });

  it("stores identical blobs once and restores bytes exactly", async () => {
    const workspace = await createWorkspace();
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-store-"));
    const blobStore = createCheckpointBlobStore(userData);
    const adapter = createFilesystemCheckpointAdapter(blobStore, userData);
    const payload = Buffer.from([0, 1, 2, 3, 4]);
    await writeFile(path.join(workspace, "shot.bin"), payload);

    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    await writeFile(path.join(workspace, "shot.bin"), Buffer.from([9, 9, 9]));
    const after = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "after",
    });
    const files = await adapter.diff(before, after);
    const binary = files.find((file) => file.path === "shot.bin");
    expect(binary?.operation).toBe("modify");
    expect(binary?.beforeHash).toBeTruthy();
    expect(binary?.afterHash).toBeTruthy();
    expect(binary?.beforeHash).not.toBe(binary?.afterHash);

    await adapter.restorePaths({
      workspaceRootPath: workspace,
      checkpoint: before,
      paths: [
        {
          path: "shot.bin",
          operation: "modify",
          restoreFromHash: binary?.beforeHash,
        },
      ],
    });
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(path.join(workspace, "shot.bin"))).toEqual(payload);
  });

  it("uses Windows-safe manifest identifiers for punctuated session ids", async () => {
    const workspace = await createWorkspace();
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-store-"));
    const adapter = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session:1",
      userMessageId: "user:1",
      phase: "before",
    });
    expect(before.ref).not.toMatch(/[:]/);
    await writeFile(path.join(workspace, "notes/a.md"), "changed\n", "utf8");
    const after = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session:1",
      userMessageId: "user:1",
      phase: "after",
    });
    const files = await adapter.diff(before, after);
    expect(files.some((file) => file.path === "notes/a.md")).toBe(true);
  });

  it("marks oversized files non-restorable and restores files under the limit", async () => {
    const workspace = await createWorkspace();
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-store-"));
    const adapter = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );
    const { MAX_CHECKPOINT_FILE_BYTES } = await import("./hash");
    const under = Buffer.alloc(64, 7);
    const over = Buffer.alloc(MAX_CHECKPOINT_FILE_BYTES + 1, 9);
    await writeFile(path.join(workspace, "under.bin"), under);
    await writeFile(path.join(workspace, "over.bin"), over);
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    await writeFile(path.join(workspace, "under.bin"), Buffer.alloc(64, 1));
    await writeFile(path.join(workspace, "over.bin"), Buffer.alloc(64, 2));
    const after = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "after",
    });
    const files = await adapter.diff(before, after);
    expect(
      files.find((file) => file.path === "under.bin")?.restorable,
    ).not.toBe(false);
    expect(files.find((file) => file.path === "over.bin")?.restorable).toBe(
      false,
    );

    const restored = await adapter.restorePaths({
      workspaceRootPath: workspace,
      checkpoint: before,
      paths: [
        { path: "under.bin", operation: "modify" },
        { path: "over.bin", operation: "modify" },
      ],
    });
    expect(restored.find((file) => file.path === "under.bin")?.status).toBe(
      "restored",
    );
    expect(restored.find((file) => file.path === "over.bin")?.status).toBe(
      "failed",
    );
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(path.join(workspace, "under.bin"))).toEqual(under);
  });

  it("rejects restoring through a parent symlink that escaped the workspace", async () => {
    const workspace = await createWorkspace();
    const outside = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-out-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-store-"));
    const adapter = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    const { rm, symlink } = await import("node:fs/promises");
    await rm(path.join(workspace, "notes"), { recursive: true, force: true });
    await symlink(outside, path.join(workspace, "notes"));
    const restored = await adapter.restorePaths({
      workspaceRootPath: workspace,
      checkpoint: before,
      paths: [{ path: "notes/a.md", operation: "delete" }],
    });
    expect(restored[0]?.status).toBe("failed");
  });

  it("does not write through a parent swapped to an external symlink after the blob read", async () => {
    const workspace = await createWorkspace();
    const outside = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-out-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-store-"));
    const inner = createCheckpointBlobStore(userData);
    const blobStore = {
      ...inner,
      async get(hash: string) {
        const bytes = await inner.get(hash);
        const { rm, symlink } = await import("node:fs/promises");
        await rm(path.join(workspace, "notes"), {
          recursive: true,
          force: true,
        });
        await symlink(outside, path.join(workspace, "notes"));
        return bytes;
      },
    };
    const adapter = createFilesystemCheckpointAdapter(blobStore, userData);
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    await writeFile(path.join(workspace, "notes/a.md"), "changed\n", "utf8");
    const restored = await adapter.restorePaths({
      workspaceRootPath: workspace,
      checkpoint: before,
      paths: [{ path: "notes/a.md", operation: "modify" }],
    });
    expect(restored[0]?.status).toBe("failed");
    const { access } = await import("node:fs/promises");
    await expect(access(path.join(outside, "a.md"))).rejects.toThrow();
  });

  it("keeps unchanged blobs stored across repeated captures", async () => {
    const workspace = await createWorkspace();
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-fs-store-"));
    const adapter = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );
    const first = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    const second = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "after",
    });
    const files = await adapter.diff(first, second);
    expect(files).toEqual([]);
    const bytes = await adapter.readFile(first, "notes/a.md");
    expect(bytes?.toString("utf8")).toBe("one\n");
  });
});
