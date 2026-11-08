import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  emptyWorktreeEnvironment,
  type ManagedWorktree,
  parseGitWorktreeList,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import {
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { describe, expect, it } from "vitest";
import { createGitRepository, runGit } from "./helpers/git-repository";

function gitWorktreePaths(repoPath: string) {
  const porcelain = runGit(repoPath, ["worktree", "list", "--porcelain"]);
  return parseGitWorktreeList(porcelain).map((worktree) =>
    realpathSync.native(worktree.path),
  );
}

function workspaceRecord(rootPath: string): WorkspaceRecord {
  const now = new Date().toISOString();
  return {
    id: "e2e-workspace",
    name: "e2e-workspace",
    rootPaths: [rootPath],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 0,
  };
}

describe("daemon managed worktree lifecycle", () => {
  it("runs setup and cleanup around creation and removal of a managed worktree", async () => {
    const repo = await createGitRepository();
    const daemon = await spawnDaemon();
    try {
      await requestDaemon(
        "workspace.save",
        { workspace: workspaceRecord(repo.path) },
        daemon.options,
      );
      await requestDaemon(
        "workspace.worktreeEnvironment.save",
        {
          ...emptyWorktreeEnvironment("e2e-workspace"),
          setupScript: "echo ready > setup-marker",
          cleanupScript:
            process.platform === "win32"
              ? "del setup-marker"
              : "rm setup-marker",
        },
        daemon.options,
      );

      const created = await requestDaemon(
        "worktree.create",
        { workspaceId: "e2e-workspace", branch: "e2e-worktree" },
        daemon.options,
      );
      expect(created.branch).toBe("e2e-worktree");
      const createdPath = realpathSync.native(created.path);
      expect(
        createdPath.startsWith(realpathSync.native(daemon.userDataPath)),
      ).toBe(true);
      expect(gitWorktreePaths(repo.path)).toContain(createdPath);
      await waitFor(() => existsSync(path.join(created.path, "setup-marker")));

      const listed = await requestDaemon("worktree.list", daemon.options);
      const managed = listed.find(
        (entry: ManagedWorktree) => entry.path === created.path,
      );
      expect(managed?.workspaceId).toBe("e2e-workspace");

      const removed = await requestDaemon(
        "worktree.remove",
        {
          workspaceId: "e2e-workspace",
          worktreePath: created.path,
        },
        daemon.options,
      );
      expect(removed).toEqual({ removed: true });
      expect(existsSync(created.path)).toBe(false);
      expect(gitWorktreePaths(repo.path)).not.toContain(createdPath);
    } finally {
      await daemon.dispose();
      await repo.dispose();
    }
  });
});
