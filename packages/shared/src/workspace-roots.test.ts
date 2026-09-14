import { describe, expect, it } from "vitest";
import {
  collectKnownWorkspaceScanRoots,
  isKnownWorkspaceScanRoot,
  normalizeWorkspaceRootPath,
  normalizeWorkspaceRootPaths,
} from "./workspace-roots";

describe("normalizeWorkspaceRootPath", () => {
  it("keeps an empty path empty instead of inventing the filesystem root", () => {
    expect(normalizeWorkspaceRootPath("")).toBe("");
  });

  it("keeps an explicit filesystem root", () => {
    expect(normalizeWorkspaceRootPath("/")).toBe("/");
  });

  it("strips trailing separators from a real project path", () => {
    expect(normalizeWorkspaceRootPath("/Users/me/project/")).toBe(
      "/Users/me/project",
    );
  });
});

describe("normalizeWorkspaceRootPaths", () => {
  it("drops empty and whitespace-only entries", () => {
    expect(normalizeWorkspaceRootPaths(["", "  "])).toEqual([]);
  });

  it("keeps an explicit filesystem root only when it was provided", () => {
    expect(normalizeWorkspaceRootPaths(["/"])).toEqual(["/"]);
  });
});

describe("isKnownWorkspaceScanRoot", () => {
  const home = "/Users/me";

  it("accepts a session worktree path as well as the registered project root", () => {
    const allowed = collectKnownWorkspaceScanRoots({
      workspaceRootPaths: ["/Users/me/project"],
      worktreePaths: ["/tmp/worktrees/feature"],
    });
    expect(isKnownWorkspaceScanRoot("/Users/me/project", allowed, home)).toBe(
      true,
    );
    expect(
      isKnownWorkspaceScanRoot("/tmp/worktrees/feature", allowed, home),
    ).toBe(true);
  });

  it("rejects the filesystem root and home even when they appear in the allowlist", () => {
    const allowed = collectKnownWorkspaceScanRoots({
      workspaceRootPaths: ["/", home],
    });
    expect(isKnownWorkspaceScanRoot("/", allowed, home)).toBe(false);
    expect(isKnownWorkspaceScanRoot(home, allowed, home)).toBe(false);
  });
});
