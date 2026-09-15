import { describe, expect, it } from "vitest";
import {
  collectKnownWorkspaceScanRoots,
  isKnownWorkspaceScanRoot,
  isPathWithinRoots,
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

describe("isPathWithinRoots", () => {
  it("accepts a file inside a registered root", () => {
    expect(
      isPathWithinRoots("/Users/me/project/docs/guide.pdf", [
        "/Users/me/project",
      ]),
    ).toBe(true);
  });

  it("rejects a file outside every root", () => {
    expect(
      isPathWithinRoots("/Users/me/my-reading/paper.pdf", [
        "/Users/me/project",
      ]),
    ).toBe(false);
  });

  it("rejects a sibling directory that shares a path prefix", () => {
    expect(
      isPathWithinRoots("/Users/me/project-evil/x.pdf", ["/Users/me/project"]),
    ).toBe(false);
  });

  it("rejects a traversal that resolves outside the root", () => {
    expect(
      isPathWithinRoots("/Users/me/project/../secret.pdf", [
        "/Users/me/project",
      ]),
    ).toBe(false);
  });

  it("returns false when no roots are registered", () => {
    expect(isPathWithinRoots("/Users/me/project/guide.pdf", [])).toBe(false);
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
