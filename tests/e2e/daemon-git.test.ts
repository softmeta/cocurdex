import { writeFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonProcess, spawnDaemon } from "./helpers/daemon-process";
import {
  createGitRepository,
  type GitRepositoryFixture,
} from "./helpers/git-repository";

describe("daemon git RPCs against a real repository", () => {
  let daemon: DaemonProcess;
  let repo: GitRepositoryFixture;

  beforeAll(async () => {
    daemon = await spawnDaemon();
    repo = await createGitRepository();
  });

  afterAll(async () => {
    await daemon.dispose();
    await repo.dispose();
  });

  it("reports status, stages, commits, and lists refs", async () => {
    const rootPath = repo.path;
    const clean = await requestDaemon(
      "git.status",
      { rootPath },
      daemon.options,
    );
    expect(clean).toEqual({ status: "ok", entries: [] });

    await writeFile(path.join(rootPath, "feature.ts"), "export const x = 1;\n");
    const dirty = await requestDaemon(
      "git.status",
      { rootPath },
      daemon.options,
    );
    expect(dirty.entries).toContainEqual({
      path: "feature.ts",
      status: "untracked",
    });

    await requestDaemon(
      "git.stageFiles",
      { rootPath, filePaths: ["feature.ts"] },
      daemon.options,
    );
    const staged = await requestDaemon(
      "git.status",
      { rootPath },
      daemon.options,
    );
    expect(staged.entries).toContainEqual({
      path: "feature.ts",
      status: "added",
    });

    const committed = await requestDaemon(
      "git.commit",
      { rootPath, message: "Add feature", includeUnstaged: false },
      daemon.options,
    );
    expect(committed.commitHash).toMatch(/^[0-9a-f]{40}$/);

    const commits = await requestDaemon(
      "git.listCommits",
      { rootPath },
      daemon.options,
    );
    expect(commits.map((commit) => commit.subject)).toEqual([
      "Add feature",
      "Initial commit",
    ]);

    const branches = await requestDaemon(
      "git.listBranches",
      { rootPath },
      daemon.options,
    );
    expect(branches).toContainEqual({
      name: "main",
      current: true,
      kind: "local",
    });

    const worktrees = await requestDaemon(
      "git.listWorktrees",
      { rootPath },
      daemon.options,
    );
    expect(worktrees).toHaveLength(1);

    const after = await requestDaemon(
      "git.status",
      { rootPath },
      daemon.options,
    );
    expect(after.entries).toEqual([]);
  });
});
