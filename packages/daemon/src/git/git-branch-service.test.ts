import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";
import { checkoutGitBranch } from "./git-branch-service";

const temporaryDirectories: string[] = [];

async function createRepositoryFixture(): Promise<string> {
  const fixturePath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-git-branch-"),
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
  await git.branch(["feature/session"]);
  return repositoryPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("checkoutGitBranch", () => {
  it("checks out an existing local branch", async () => {
    const repositoryPath = await createRepositoryFixture();

    await checkoutGitBranch(repositoryPath, "feature/session");

    await expect(
      simpleGit(repositoryPath).revparse(["--abbrev-ref", "HEAD"]),
    ).resolves.toBe("feature/session");
  });

  it("rejects values that are not valid branch names", async () => {
    const repositoryPath = await createRepositoryFixture();

    await expect(
      checkoutGitBranch(repositoryPath, "--detach"),
    ).rejects.toThrow();
  });
});
