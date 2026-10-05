import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addGitWorktree } from "./git-worktree";
import {
  createWorktreePath,
  removeAppManagedWorktree,
} from "./orchestration-workspace";
import { runGit } from "./workspace-changes/git-run";

const temporaryDirectories: string[] = [];

async function createFixture() {
  const fixturePath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-remove-worktree-"),
  );
  temporaryDirectories.push(fixturePath);
  const repoRootPath = path.join(fixturePath, "repository");
  const worktreeRootPath = path.join(fixturePath, "worktrees");
  await mkdir(repoRootPath);
  await runGit(["init"], { cwd: repoRootPath });
  await runGit(["config", "user.name", "Cocurdex Tests"], {
    cwd: repoRootPath,
  });
  await runGit(["config", "user.email", "tests@cocurdex.local"], {
    cwd: repoRootPath,
  });
  await writeFile(path.join(repoRootPath, "README.md"), "# Fixture\n");
  await runGit(["add", "README.md"], { cwd: repoRootPath });
  await runGit(["commit", "-m", "Initial commit"], { cwd: repoRootPath });
  const options = {
    repoRootPath,
    userDataPath: path.join(fixturePath, "user-data"),
    worktreeRootPath,
  };
  return options;
}

async function branchExists(repoRootPath: string, branch: string) {
  const output = await runGit(["branch", "--list", branch], {
    cwd: repoRootPath,
  });
  return output.trim().length > 0;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("removeAppManagedWorktree", () => {
  it("deletes the merged app-created branch with the worktree", async () => {
    const options = await createFixture();
    const worktree = await addGitWorktree(options);

    await expect(
      removeAppManagedWorktree({ ...options, worktreePath: worktree.path }),
    ).resolves.toBe(true);

    expect(
      await branchExists(options.repoRootPath, String(worktree.branch)),
    ).toBe(false);
  });

  it("keeps an app-created branch that has unmerged commits", async () => {
    const options = await createFixture();
    const worktree = await addGitWorktree(options);
    await writeFile(path.join(worktree.path, "work.txt"), "work\n");
    await runGit(["add", "work.txt"], { cwd: worktree.path });
    await runGit(["commit", "-m", "Work"], { cwd: worktree.path });

    await removeAppManagedWorktree({ ...options, worktreePath: worktree.path });

    expect(
      await branchExists(options.repoRootPath, String(worktree.branch)),
    ).toBe(true);
  });

  it("keeps a user-named branch", async () => {
    const options = await createFixture();
    const worktree = await addGitWorktree({ ...options, branch: "feature/x" });

    await removeAppManagedWorktree({ ...options, worktreePath: worktree.path });

    expect(await branchExists(options.repoRootPath, "feature/x")).toBe(true);
  });
});

describe("orchestration workspace helpers", () => {
  it("places worker worktrees outside the repository under app data", () => {
    const worktreePath = createWorktreePath({
      repoRootPath: "/Users/example/project",
      orchestrationRunId: "run-1",
      agentTaskRunId: "task-1",
      userDataPath: "/tmp/cocurdex-data",
    });

    expect(worktreePath.startsWith("/tmp/cocurdex-data")).toBe(true);
    expect(worktreePath).toContain("worktrees");
    expect(worktreePath).toContain(path.join("run-1", "task-1"));
    expect(worktreePath.startsWith("/Users/example/project")).toBe(false);
  });

  it("uses a stable repository hash in worktree paths", () => {
    const first = createWorktreePath({
      repoRootPath: "/Users/example/project",
      orchestrationRunId: "run-a",
      agentTaskRunId: "task-a",
      userDataPath: "/tmp/cocurdex-data",
    });
    const second = createWorktreePath({
      repoRootPath: "/Users/example/project",
      orchestrationRunId: "run-b",
      agentTaskRunId: "task-b",
      userDataPath: "/tmp/cocurdex-data",
    });

    expect(first.split(path.sep).at(-3)).toBe(second.split(path.sep).at(-3));
  });
});
