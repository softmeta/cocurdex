import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";
import { resolveGitRepositoryPaths } from "./git-client";

const temporaryDirectories: string[] = [];

async function createRepositoryFixture(): Promise<{
  repositoryPath: string;
  worktreePath: string;
}> {
  const fixturePath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-git-client-"),
  );
  temporaryDirectories.push(fixturePath);

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
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
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
    const directory = await mkdtemp(
      path.join(tmpdir(), "cocurdex-non-git-client-"),
    );
    temporaryDirectories.push(directory);

    await expect(resolveGitRepositoryPaths(directory)).resolves.toBeNull();
  });
});
