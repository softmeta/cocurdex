import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";
import { listGitWorktrees } from "./git-worktree-service";

const temporaryDirectories: string[] = [];

async function createRepositoryFixture(): Promise<string> {
  const fixturePath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-git-worktree-"),
  );
  temporaryDirectories.push(fixturePath);

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
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 100,
      }),
    ),
  );
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
    const directory = await mkdtemp(path.join(tmpdir(), "cocurdex-non-git-"));
    temporaryDirectories.push(directory);

    await expect(listGitWorktrees(directory)).resolves.toEqual([]);
  });
});
