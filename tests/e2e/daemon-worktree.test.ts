import { existsSync, realpathSync } from "node:fs";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { ManagedWorktree, WorkspaceRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { spawnDaemon } from "./helpers/daemon-process";
import { createGitRepository, runGit } from "./helpers/git-repository";

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
  it("creates, lists, and removes a worktree inside the user data path", async () => {
    const repo = await createGitRepository();
    const daemon = await spawnDaemon();
    try {
      await requestDaemon(
        "workspace.save",
        { workspace: workspaceRecord(repo.path) },
        daemon.options,
      );

      const created = await requestDaemon(
        "worktree.create",
        { workspaceId: "e2e-workspace", branch: "e2e-worktree" },
        daemon.options,
      );
      expect(created.branch).toBe("e2e-worktree");
      expect(
        realpathSync(created.path).startsWith(
          realpathSync(daemon.userDataPath),
        ),
      ).toBe(true);
      expect(existsSync(created.path)).toBe(true);
      expect(runGit(repo.path, ["worktree", "list"])).toContain(created.path);

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
      expect(runGit(repo.path, ["worktree", "list"])).not.toContain(
        created.path,
      );
    } finally {
      await daemon.dispose();
      await repo.dispose();
    }
  });
});
