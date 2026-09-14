import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";

import { commitGitChanges, pushGitBranch } from "./git-commit-service";

const temporaryDirectories: string[] = [];

async function createRepositoryFixture(): Promise<string> {
  const fixturePath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-git-commit-"),
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
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("commitGitChanges", () => {
  it("commits staged changes only when includeUnstaged is false", async () => {
    const repositoryPath = await createRepositoryFixture();
    const git = simpleGit(repositoryPath);
    await writeFile(path.join(repositoryPath, "staged.txt"), "staged\n");
    await writeFile(path.join(repositoryPath, "unstaged.txt"), "unstaged\n");
    await git.add("staged.txt");

    const { commitHash } = await commitGitChanges(repositoryPath, {
      message: "Stage only",
      includeUnstaged: false,
    });

    expect(commitHash.length).toBeGreaterThan(0);
    const show = await git.show(["--name-only", "--pretty=format:", "HEAD"]);
    expect(show).toContain("staged.txt");
    expect(show).not.toContain("unstaged.txt");
  });

  it("stages the whole worktree when includeUnstaged is true", async () => {
    const repositoryPath = await createRepositoryFixture();
    const git = simpleGit(repositoryPath);
    await writeFile(path.join(repositoryPath, "a.txt"), "a\n");
    await writeFile(path.join(repositoryPath, "b.txt"), "b\n");

    await commitGitChanges(repositoryPath, {
      message: "All changes",
      includeUnstaged: true,
    });

    const show = await git.show(["--name-only", "--pretty=format:", "HEAD"]);
    expect(show).toContain("a.txt");
    expect(show).toContain("b.txt");
  });

  it("rejects a blank message", async () => {
    const repositoryPath = await createRepositoryFixture();
    await writeFile(path.join(repositoryPath, "feature.ts"), "export {}\n");
    await simpleGit(repositoryPath).add("feature.ts");

    await expect(
      commitGitChanges(repositoryPath, {
        message: "  ",
        includeUnstaged: false,
      }),
    ).rejects.toThrow(/commit message is required/i);
  });

  it("rejects when there is nothing to commit", async () => {
    const repositoryPath = await createRepositoryFixture();

    await expect(
      commitGitChanges(repositoryPath, {
        message: "Empty",
        includeUnstaged: false,
      }),
    ).rejects.toThrow();
  });
});

describe("pushGitBranch", () => {
  it("rejects when no remote is configured", async () => {
    const repositoryPath = await createRepositoryFixture();

    await expect(pushGitBranch(repositoryPath)).rejects.toThrow(/remote/i);
  });

  it("pushes the current branch to origin and sets upstream", async () => {
    const repositoryPath = await createRepositoryFixture();
    const barePath = path.join(path.dirname(repositoryPath), "remote-bare.git");
    await simpleGit().raw(["init", "--bare", barePath]);
    const git = simpleGit(repositoryPath);
    await git.addRemote("origin", barePath);

    const result = await pushGitBranch(repositoryPath);

    expect(result.remote).toBe("origin");
    expect(result.branch.length).toBeGreaterThan(0);
    const remotes = await simpleGit(barePath).branch(["-a"]);
    expect(Object.keys(remotes.branches).length).toBeGreaterThan(0);
  });
});
