import { mkdtemp, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureGitCommit, createGitCheckpointAdapter } from "./git-checkpoint";
import { runGit } from "./git-run";

async function createGitWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "cocurdex-git-checkpoint-"));
  await runGit(["init"], { cwd: root });
  await runGit(["checkout", "-b", "main"], { cwd: root, allowFailure: true });
  await writeFile(path.join(root, "readme.md"), "hello\n", "utf8");
  await runGit(["add", "readme.md"], { cwd: root });
  await runGit(["commit", "-m", "init"], { cwd: root });
  return root;
}

describe("git checkpoint adapter", () => {
  it("reports renames with both blob ids from one raw diff", async () => {
    const workspace = await createGitWorkspace();
    const adapter = createGitCheckpointAdapter();
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    await rename(
      path.join(workspace, "readme.md"),
      path.join(workspace, "docs.md"),
    );
    const after = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-2",
      phase: "after",
    });
    const files = await adapter.diff(before, after);
    expect(files).toEqual([
      expect.objectContaining({
        path: "docs.md",
        previousPath: "readme.md",
        operation: "rename",
        beforeSize: 6,
        restorable: true,
      }),
    ]);
    expect(files[0]?.beforeHash).toMatch(/^[0-9a-f]{40}$/);
    expect(files[0]?.afterHash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("sees a same-size edit between two captures of one workspace", async () => {
    // Captures reuse a per-workspace scratch index; a stale stat cache would
    // silently hide edits that keep the file size and mtime second.
    const workspace = await createGitWorkspace();
    const adapter = createGitCheckpointAdapter();
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    await writeFile(path.join(workspace, "readme.md"), "world\n", "utf8");
    const after = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-2",
      phase: "after",
    });
    expect(await adapter.diff(before, after)).toEqual([
      expect.objectContaining({ path: "readme.md", operation: "modify" }),
    ]);
  });

  it("captures a hidden commit and diffs a tracked modification", async () => {
    const workspace = await createGitWorkspace();
    const adapter = createGitCheckpointAdapter();
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    await writeFile(path.join(workspace, "readme.md"), "hello world\n", "utf8");
    await writeFile(path.join(workspace, "created.md"), "new\n", "utf8");
    const after = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "after",
    });
    const files = await adapter.diff(before, after);
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "readme.md", operation: "modify" }),
        expect.objectContaining({ path: "created.md", operation: "add" }),
      ]),
    );
    expect(await captureGitCommit(workspace)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("refuses a checkpoint whose changed content exceeds the Git budget", async () => {
    const workspace = await createGitWorkspace();
    await writeFile(path.join(workspace, "readme.md"), "too much content\n");
    const adapter = createGitCheckpointAdapter({ maxChangedBytes: 4 });

    await expect(
      adapter.capture({
        workspaceRootPath: workspace,
        sessionId: "session-1",
        userMessageId: "user-1",
        phase: "after",
      }),
    ).rejects.toThrow("Git checkpoint changed-content limit");
  });

  it("restores exact bytes and deletes session checkpoint refs on cleanup", async () => {
    const workspace = await createGitWorkspace();
    const adapter = createGitCheckpointAdapter();
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    await writeFile(path.join(workspace, "readme.md"), "changed\n", "utf8");
    const after = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "after",
    });
    const files = await adapter.diff(before, after);
    const results = await adapter.restorePaths({
      workspaceRootPath: workspace,
      checkpoint: before,
      paths: files,
    });
    expect(results.every((result) => result.status === "restored")).toBe(true);
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(path.join(workspace, "readme.md"), "utf8")).toBe(
      "hello\n",
    );

    await adapter.cleanup({
      refs: [before.ref, after.ref],
      workspaceRootPath: workspace,
      sessionId: "session-1",
    });
    const remaining = await runGit(
      [
        "for-each-ref",
        "--format=%(refname)",
        "refs/cocurdex/checkpoints/session-1",
      ],
      { cwd: workspace, allowFailure: true },
    );
    expect(remaining.trim()).toBe("");
  });

  it("rejects a rename restore whose previous path escapes the workspace", async () => {
    const workspace = await createGitWorkspace();
    const adapter = createGitCheckpointAdapter();
    const before = await adapter.capture({
      workspaceRootPath: workspace,
      sessionId: "session-1",
      userMessageId: "user-1",
      phase: "before",
    });
    const results = await adapter.restorePaths({
      workspaceRootPath: workspace,
      checkpoint: before,
      paths: [
        {
          path: "readme.md",
          previousPath: "../outside.txt",
          operation: "rename",
        },
      ],
    });
    expect(results[0]?.status).toBe("failed");
  });
});
