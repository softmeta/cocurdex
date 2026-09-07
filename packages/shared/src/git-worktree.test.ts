import { describe, expect, it } from "vitest";
import {
  parseGitWorktreeList,
  remapPathUnderRoot,
  resolveSessionWorkingPath,
  suggestWorktreeBranchName,
} from "./git-worktree";

describe("parseGitWorktreeList", () => {
  it("parses the primary worktree and linked checkouts", () => {
    const porcelain = [
      "worktree /Users/me/project",
      "HEAD abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      "branch refs/heads/main",
      "",
      "worktree /tmp/worktrees/feature",
      "HEAD 1234561234561234561234561234561234561234",
      "branch refs/heads/cocurdex/abcd1234",
      "",
      "worktree /tmp/worktrees/detached",
      "HEAD 789abc789abc789abc789abc789abc789abc789a",
      "detached",
      "",
    ].join("\n");

    expect(parseGitWorktreeList(porcelain)).toEqual([
      {
        path: "/Users/me/project",
        head: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        branch: "main",
        detached: false,
        locked: false,
        prunable: false,
        bare: false,
      },
      {
        path: "/tmp/worktrees/feature",
        head: "1234561234561234561234561234561234561234",
        branch: "cocurdex/abcd1234",
        detached: false,
        locked: false,
        prunable: false,
        bare: false,
      },
      {
        path: "/tmp/worktrees/detached",
        head: "789abc789abc789abc789abc789abc789abc789a",
        branch: null,
        detached: true,
        locked: false,
        prunable: false,
        bare: false,
      },
    ]);
  });

  it("records locked, prunable, and bare worktrees", () => {
    const porcelain = [
      "worktree /repo",
      "bare",
      "",
      "worktree /repo-locked",
      "HEAD aa",
      "branch refs/heads/locked",
      "locked why",
      "",
      "worktree /repo-pruned",
      "HEAD bb",
      "branch refs/heads/gone",
      "prunable gitdir file points to non-existent location",
      "",
    ].join("\n");

    expect(parseGitWorktreeList(porcelain)).toEqual([
      {
        path: "/repo",
        head: "",
        branch: null,
        detached: false,
        locked: false,
        prunable: false,
        bare: true,
      },
      {
        path: "/repo-locked",
        head: "aa",
        branch: "locked",
        detached: false,
        locked: true,
        prunable: false,
        bare: false,
      },
      {
        path: "/repo-pruned",
        head: "bb",
        branch: "gone",
        detached: false,
        locked: false,
        prunable: true,
        bare: false,
      },
    ]);
  });

  it("returns an empty list for blank porcelain", () => {
    expect(parseGitWorktreeList("")).toEqual([]);
    expect(parseGitWorktreeList("   \n")).toEqual([]);
  });
});

describe("resolveSessionWorkingPath", () => {
  it("uses the workspace root when no worktree is bound", () => {
    expect(
      resolveSessionWorkingPath({
        workspaceRootPath: "/Users/me/project",
        worktreePath: null,
      }),
    ).toBe("/Users/me/project");
    expect(
      resolveSessionWorkingPath({
        workspaceRootPath: "/Users/me/project",
        worktreePath: "  ",
      }),
    ).toBe("/Users/me/project");
  });

  it("uses the bound worktree path when present", () => {
    expect(
      resolveSessionWorkingPath({
        workspaceRootPath: "/Users/me/project",
        worktreePath: "/tmp/worktrees/feature",
      }),
    ).toBe("/tmp/worktrees/feature");
  });
});

describe("suggestWorktreeBranchName", () => {
  it("builds a cocurdex-prefixed slug from an id", () => {
    expect(
      suggestWorktreeBranchName("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
    ).toBe("cocurdex/a1b2c3d4");
  });

  it("falls back when the id has no alphanumeric characters", () => {
    expect(suggestWorktreeBranchName("---")).toBe("cocurdex/worktree");
  });
});

describe("remapPathUnderRoot", () => {
  it("rewrites files that live under the previous root", () => {
    expect(
      remapPathUnderRoot(
        "/Users/me/project/src/app.ts",
        "/Users/me/project",
        "/tmp/worktrees/feature",
      ),
    ).toBe("/tmp/worktrees/feature/src/app.ts");
  });

  it("rewrites the root path itself", () => {
    expect(
      remapPathUnderRoot(
        "/Users/me/project",
        "/Users/me/project/",
        "/tmp/worktrees/feature",
      ),
    ).toBe("/tmp/worktrees/feature");
  });

  it("leaves paths outside the previous root unchanged", () => {
    expect(
      remapPathUnderRoot(
        "/elsewhere/file.ts",
        "/Users/me/project",
        "/tmp/worktrees/feature",
      ),
    ).toBe("/elsewhere/file.ts");
  });
});
