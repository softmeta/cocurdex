import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkoutGitBranch } from "@cocurdex/daemon/internal/git/git-branch-service";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

async function createRepositoryFixture(): Promise<string> {
  const fixturePath = await tempDirs.create("cocurdex-git-branch-");

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
  await tempDirs.cleanup();
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
