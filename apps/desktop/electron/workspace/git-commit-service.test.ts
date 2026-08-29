import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateCommitMessageMock } = vi.hoisted(() => ({
  generateCommitMessageMock: vi.fn(),
}));

vi.mock("../provider/commit-message-generation", () => ({
  generateCommitMessageFromConfiguredModel: generateCommitMessageMock,
}));

import {
  commitGitChanges,
  generateGitCommitMessage,
  pushGitBranch,
} from "./git-commit-service";

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

beforeEach(() => {
  generateCommitMessageMock.mockReset();
  generateCommitMessageMock.mockRejectedValue(
    new Error("No commit message model configured"),
  );
});

describe("commitGitChanges", () => {
  it("commits staged changes only when includeUnstaged is false", async () => {
    const repositoryPath = await createRepositoryFixture();
    const git = simpleGit(repositoryPath);
    await writeFile(path.join(repositoryPath, "staged.txt"), "staged\n");
    await writeFile(path.join(repositoryPath, "unstaged.txt"), "unstaged\n");
    await git.add("staged.txt");

    const { commitHash, generatedMessage } = await commitGitChanges(
      repositoryPath,
      {
        message: "Stage only",
        includeUnstaged: false,
      },
    );

    expect(commitHash.length).toBeGreaterThan(0);
    expect(generatedMessage).toBe(false);
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

  it("preserves a generated title and unordered-list body", async () => {
    const repositoryPath = await createRepositoryFixture();
    const git = simpleGit(repositoryPath);
    const generatedMessage =
      "feat(git): generate detailed commits\n\n- Add a concise title\n- Summarize changes as bullets";
    await writeFile(path.join(repositoryPath, "feature.ts"), "export {}\n");
    await git.add("feature.ts");
    generateCommitMessageMock.mockResolvedValue(generatedMessage);

    await commitGitChanges(repositoryPath, {
      message: "",
      includeUnstaged: false,
    });

    const committedMessage = await git.raw(["log", "-1", "--format=%B"]);
    expect(committedMessage.trim()).toBe(generatedMessage);
  });

  it("restores the previous index when an all-changes commit fails", async () => {
    const repositoryPath = await createRepositoryFixture();
    const git = simpleGit(repositoryPath);
    await writeFile(path.join(repositoryPath, "staged.txt"), "staged\n");
    await writeFile(path.join(repositoryPath, "unstaged.txt"), "unstaged\n");
    await git.add("staged.txt");

    await expect(
      commitGitChanges(repositoryPath, {
        message: "",
        includeUnstaged: true,
      }),
    ).rejects.toThrow(/commit message model/i);

    const stagedPaths = await git.diff(["--cached", "--name-only"]);
    expect(stagedPaths).toContain("staged.txt");
    expect(stagedPaths).not.toContain("unstaged.txt");
    const unstagedPaths = await git.raw([
      "ls-files",
      "--others",
      "--exclude-standard",
    ]);
    expect(unstagedPaths).toContain("unstaged.txt");
  }, 15_000);

  it("does not mutate the real index when message generation fails under an index lock", async () => {
    const repositoryPath = await createRepositoryFixture();
    const git = simpleGit(repositoryPath);
    const indexLockPath = path.join(repositoryPath, ".git", "index.lock");
    await writeFile(path.join(repositoryPath, "staged.txt"), "staged\n");
    await writeFile(path.join(repositoryPath, "unstaged.txt"), "unstaged\n");
    await git.add("staged.txt");
    generateCommitMessageMock.mockImplementation(async () => {
      await writeFile(indexLockPath, "");
      throw new Error("Model returned an empty commit message");
    });

    await expect(
      commitGitChanges(repositoryPath, {
        message: "",
        includeUnstaged: true,
      }),
    ).rejects.toThrow("Model returned an empty commit message");

    await rm(indexLockPath, { force: true });
    const stagedPaths = await git.diff(["--cached", "--name-only"]);
    expect(stagedPaths).toContain("staged.txt");
    expect(stagedPaths).not.toContain("unstaged.txt");
  });

  it("rejects blank message when no commit message model is configured", async () => {
    const repositoryPath = await createRepositoryFixture();
    await writeFile(path.join(repositoryPath, "feature.ts"), "export {}\n");
    await simpleGit(repositoryPath).add("feature.ts");

    await expect(
      commitGitChanges(repositoryPath, {
        message: "  ",
        includeUnstaged: false,
      }),
    ).rejects.toThrow(/commit message model/i);
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

  it("rejects blank message when there is nothing staged to generate from", async () => {
    const repositoryPath = await createRepositoryFixture();

    await expect(
      commitGitChanges(repositoryPath, {
        message: "",
        includeUnstaged: false,
      }),
    ).rejects.toThrow(/nothing to commit/i);
  });
});

describe("generateGitCommitMessage", () => {
  it("returns a draft without committing", async () => {
    const repositoryPath = await createRepositoryFixture();
    const git = simpleGit(repositoryPath);
    const generatedMessage = "feat: draft only";
    await writeFile(path.join(repositoryPath, "feature.ts"), "export {}\n");
    await git.add("feature.ts");
    generateCommitMessageMock.mockResolvedValue(generatedMessage);

    const message = await generateGitCommitMessage(repositoryPath, {
      includeUnstaged: false,
    });

    expect(message).toBe(generatedMessage);
    const log = await git.raw(["log", "--oneline"]);
    expect(log).not.toContain("feat: draft only");
  });

  it("does not stage unstaged files when includeUnstaged is true", async () => {
    const repositoryPath = await createRepositoryFixture();
    const git = simpleGit(repositoryPath);
    await writeFile(path.join(repositoryPath, "staged.txt"), "staged\n");
    await writeFile(path.join(repositoryPath, "unstaged.txt"), "unstaged\n");
    await git.add("staged.txt");
    generateCommitMessageMock.mockResolvedValue("chore: all changes");

    await generateGitCommitMessage(repositoryPath, {
      includeUnstaged: true,
    });

    const stagedPaths = await git.diff(["--cached", "--name-only"]);
    expect(stagedPaths).toContain("staged.txt");
    expect(stagedPaths).not.toContain("unstaged.txt");
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
