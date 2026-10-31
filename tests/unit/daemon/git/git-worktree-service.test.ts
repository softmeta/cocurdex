import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listGitWorktrees } from "@cocurdex/daemon/internal/git/git-worktree-service";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

async function createRepositoryFixture(): Promise<string> {
  const fixturePath = await tempDirs.create("cocurdex-git-worktree-");

  const repositoryPath = path.join(fixturePath, "repository");
  await mkdir(repositoryPath);
  const git = simpleGit(repositoryPath);
  await git.init();
  await git.addConfig("user.name", "Cocurdex Tests");
  await git.addConfig("user.email", "tests@cocurdex.local");
  await writeFile(path.join(repositoryPath, "README.md"), "# Fixture\n");
  await git.add("README.md");
  await git.commit("Initial commit");
  return repositoryPath;
}

afterEach(async () => {
  await tempDirs.cleanup();
});

describe("listGitWorktrees", () => {
  it("returns the primary worktree for a regular repository", async () => {
    const repositoryPath = await createRepositoryFixture();
    const current = await simpleGit(repositoryPath).revparse([
      "--abbrev-ref",
      "HEAD",
    ]);
    const worktrees = await listGitWorktrees(repositoryPath);

    expect(worktrees).toHaveLength(1);
    expect(worktrees[0]?.branch).toBe(current.trim());
  });

  it("returns an empty list outside a git repository", async () => {
    const directory = await tempDirs.create("cocurdex-non-git-");

    await expect(listGitWorktrees(directory)).resolves.toEqual([]);
  });
});
