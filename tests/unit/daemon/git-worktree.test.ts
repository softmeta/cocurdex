import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  addGitWorktree,
  listGitWorktrees,
} from "@cocurdex/daemon/internal/git-worktree";
import { runGit } from "@cocurdex/daemon/internal/workspace-changes/git-run";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

async function createRepositoryFixture(): Promise<string> {
  const fixturePath = await tempDirs.create("cocurdex-git-worktree-");

  const repositoryPath = path.join(fixturePath, "repository");
  await mkdir(repositoryPath);
  await runGit(["init"], { cwd: repositoryPath });
  await runGit(["config", "user.name", "Cocurdex Tests"], {
    cwd: repositoryPath,
  });
  await runGit(["config", "user.email", "tests@cocurdex.local"], {
    cwd: repositoryPath,
  });
  await writeFile(path.join(repositoryPath, "README.md"), "# Fixture\n");
  await runGit(["add", "README.md"], { cwd: repositoryPath });
  await runGit(["commit", "-m", "Initial commit"], { cwd: repositoryPath });
  return repositoryPath;
}

afterEach(async () => {
  await tempDirs.cleanup();
});

describe("listGitWorktrees", () => {
  it("returns the primary worktree for a regular repository", async () => {
    const repositoryPath = await createRepositoryFixture();
    const current = (
      await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: repositoryPath,
      })
    ).trim();
    const worktrees = await listGitWorktrees(repositoryPath);

    expect(worktrees).toHaveLength(1);
    expect(worktrees[0]?.branch).toBe(current);
  });

  it("returns an empty list outside a git repository", async () => {
    const directory = await tempDirs.create("cocurdex-non-git-");

    await expect(listGitWorktrees(directory)).resolves.toEqual([]);
  });
});

describe("addGitWorktree", () => {
  it("creates an isolated checkout on a new branch under app data", async () => {
    const repositoryPath = await createRepositoryFixture();
    const userDataPath = path.join(path.dirname(repositoryPath), "user-data");

    const created = await addGitWorktree({
      repoRootPath: repositoryPath,
      branch: "cocurdex/parallel",
      userDataPath,
    });

    expect(created.branch).toBe("cocurdex/parallel");
    expect(created.path.includes("worktrees")).toBe(true);
    expect(created.path.includes(path.basename(userDataPath))).toBe(true);

    const current = (
      await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: repositoryPath,
      })
    ).trim();
    const worktrees = await listGitWorktrees(repositoryPath);
    expect(worktrees.map((worktree) => worktree.branch).sort()).toEqual(
      ["cocurdex/parallel", current].sort(),
    );

    await expect(
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: created.path }),
    ).resolves.toBe("cocurdex/parallel\n");
  });

  it("places the checkout under a configured root", async () => {
    const repositoryPath = await createRepositoryFixture();
    const userDataPath = path.join(path.dirname(repositoryPath), "user-data");
    const worktreeRootPath = path.join(
      path.dirname(repositoryPath),
      "custom-worktrees",
    );

    const created = await addGitWorktree({
      repoRootPath: repositoryPath,
      branch: "cocurdex/custom-root",
      userDataPath,
      worktreeRootPath,
    });

    expect(created.path.includes("custom-worktrees")).toBe(true);
  });

  it("rejects a branch name that already exists", async () => {
    const repositoryPath = await createRepositoryFixture();
    const userDataPath = path.join(path.dirname(repositoryPath), "user-data");
    const current = (
      await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: repositoryPath,
      })
    ).trim();

    await expect(
      addGitWorktree({
        repoRootPath: repositoryPath,
        branch: current,
        userDataPath,
      }),
    ).rejects.toThrow();
  });
});
