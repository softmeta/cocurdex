import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveGitRepositoryPaths } from "@cocurdex/daemon/internal/git/git-client";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

async function createRepositoryFixture(): Promise<{
  repositoryPath: string;
  worktreePath: string;
}> {
  const fixturePath = await tempDirs.create("cocurdex-git-client-");

  const repositoryPath = path.join(fixturePath, "repository");
  const worktreePath = path.join(fixturePath, "worktree");
  await mkdir(repositoryPath);

  const git = simpleGit(repositoryPath);
  await git.init();
  await git.addConfig("user.name", "Cocurdex Tests");
  await git.addConfig("user.email", "tests@cocurdex.local");
  await writeFile(path.join(repositoryPath, "README.md"), "# Fixture\n");
  await git.add("README.md");
  await git.commit("Initial commit");
  await git.raw(["worktree", "add", "-b", "feature/worktree", worktreePath]);

  return { repositoryPath, worktreePath };
}

afterEach(async () => {
  await tempDirs.cleanup();
});

describe("resolveGitRepositoryPaths", () => {
  it("resolves the same git and common directory for a regular repository", async () => {
    const { repositoryPath } = await createRepositoryFixture();
    const expectedGitDir = await realpath(path.join(repositoryPath, ".git"));

    await expect(resolveGitRepositoryPaths(repositoryPath)).resolves.toEqual({
      commonDir: expectedGitDir,
      gitDir: expectedGitDir,
    });
  });

  it("resolves separate git and common directories for a linked worktree", async () => {
    const { repositoryPath, worktreePath } = await createRepositoryFixture();
    const expectedCommonDir = await realpath(path.join(repositoryPath, ".git"));

    const paths = await resolveGitRepositoryPaths(worktreePath);

    expect(paths?.commonDir).toBe(expectedCommonDir);
    expect(paths?.gitDir).toMatch(
      new RegExp(
        `^${path.join(expectedCommonDir, "worktrees").replaceAll("\\", "\\\\")}`,
      ),
    );
    expect(paths?.gitDir).not.toBe(paths?.commonDir);
  });

  it("returns null outside a git repository", async () => {
    const directory = await tempDirs.create("cocurdex-non-git-client-");

    await expect(resolveGitRepositoryPaths(directory)).resolves.toBeNull();
  });
});
