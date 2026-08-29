import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getWorkspaceDiff,
  getWorkspaceGitStatus,
  listGitBranches,
  listGitCommits,
  parsePorcelainToGitStatusEntries,
} from "./git-diff-service";

describe("git-diff-service", () => {
  let dir: string;
  let featureCommit: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "git-diff-service-"));
    const git = simpleGit(dir);
    await git.init();
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("user.name", "Test");
    // Mainline commit.
    await writeFile(join(dir, "readme.txt"), "hello\n", "utf8");
    await git.add("readme.txt");
    await git.commit("initial");
    // Prefer a stable main branch name across git versions.
    try {
      await git.branch(["-M", "main"]);
    } catch {
      // Already on main.
    }
    // Feature branch with a second commit.
    await git.checkoutLocalBranch("feature");
    await writeFile(join(dir, "feature.txt"), "feature work\n", "utf8");
    await git.add("feature.txt");
    const commit = await git.commit("add feature");
    featureCommit = commit.commit;
    // Staged + unstaged working-tree edits on feature.
    await writeFile(join(dir, "staged.txt"), "staged body\n", "utf8");
    await git.add("staged.txt");
    await writeFile(join(dir, "unstaged.txt"), "unstaged body\n", "utf8");
    await writeFile(join(dir, "readme.txt"), "hello edited\n", "utf8");
  }, 30_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lists local branches with kinds", async () => {
    const branches = await listGitBranches(dir);
    const names = branches.map((branch) => branch.name);
    expect(names).toContain("main");
    expect(names).toContain("feature");
    expect(branches.every((branch) => branch.kind != null)).toBe(true);
    expect(branches.find((branch) => branch.name === "feature")?.current).toBe(
      true,
    );
  });

  it("lists recent commits", async () => {
    const commits = await listGitCommits(dir, { limit: 10 });
    expect(commits.length).toBeGreaterThanOrEqual(2);
    expect(commits[0]?.subject).toBe("add feature");
  });

  it("working mode includes staged, unstaged, and untracked", async () => {
    const result = await getWorkspaceDiff(dir, { mode: "working" });
    expect(result.status).toBe("ok");
    const paths = result.changes.map((change) => change.path).sort();
    expect(paths).toEqual(["readme.txt", "staged.txt", "unstaged.txt"]);
  });

  it("staged mode only includes index changes", async () => {
    const result = await getWorkspaceDiff(dir, { mode: "staged" });
    expect(result.status).toBe("ok");
    expect(result.changes.map((change) => change.path)).toEqual(["staged.txt"]);
    expect(result.changes[0]?.newContents).toContain("staged body");
  });

  it("unstaged mode includes worktree and untracked changes", async () => {
    const result = await getWorkspaceDiff(dir, { mode: "unstaged" });
    expect(result.status).toBe("ok");
    const paths = result.changes.map((change) => change.path).sort();
    expect(paths).toEqual(["readme.txt", "unstaged.txt"]);
  });

  it("commit mode shows only that commit's files", async () => {
    const result = await getWorkspaceDiff(dir, {
      mode: "commit",
      commit: featureCommit,
    });
    expect(result.status).toBe("ok");
    expect(result.changes.map((change) => change.path)).toEqual([
      "feature.txt",
    ]);
    expect(result.changes[0]?.newContents).toContain("feature work");
  });

  it("branch mode shows source changes relative to target", async () => {
    // source=feature → target=main ⇒ git diff main...feature
    const result = await getWorkspaceDiff(dir, {
      mode: "branch",
      source: "feature",
      target: "main",
    });
    expect(result.status).toBe("ok");
    expect(result.changes.map((change) => change.path)).toEqual([
      "feature.txt",
    ]);
  });

  it("status is lightweight path+kind without file contents", async () => {
    const result = await getWorkspaceGitStatus(dir);
    expect(result.status).toBe("ok");
    const byPath = new Map(
      result.entries.map((entry) => [entry.path, entry.status]),
    );
    expect(byPath.get("readme.txt")).toBe("modified");
    expect(byPath.get("staged.txt")).toBe("added");
    expect(byPath.get("unstaged.txt")).toBe("untracked");
  });
});

describe("parsePorcelainToGitStatusEntries", () => {
  it("maps common porcelain XY codes", () => {
    const raw = [
      " M path/modified.ts",
      "A  path/added.ts",
      "D  path/deleted.ts",
      "?? path/new.ts",
      "R  old.ts",
      "path/renamed.ts",
    ].join("\0");
    expect(parsePorcelainToGitStatusEntries(raw)).toEqual([
      { path: "path/modified.ts", status: "modified" },
      { path: "path/added.ts", status: "added" },
      { path: "path/deleted.ts", status: "deleted" },
      { path: "path/new.ts", status: "untracked" },
      { path: "path/renamed.ts", status: "renamed" },
    ]);
  });
});
