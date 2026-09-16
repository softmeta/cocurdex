import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectKnownWorkspaceScanRoots,
  isKnownWorkspaceScanRoot,
  isPathWithinRoots,
  normalizeWorkspaceRootPath,
  normalizeWorkspaceRootPaths,
  workspacePathsEqual,
} from "./workspace-roots";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPlatform(platform: string) {
  vi.stubGlobal("process", { platform });
  // Node 21+ exposes a global navigator; override it too so the fallback
  // branch does not leak the host platform into stubbed-process tests.
  vi.stubGlobal("navigator", { platform: "TestOS" });
}

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

describe("path case folding by platform", () => {
  it("folds case on macOS", () => {
    stubPlatform("darwin");
    expect(workspacePathsEqual("/Users/Me/Project", "/users/me/project")).toBe(
      true,
    );
    expect(
      isPathWithinRoots("/users/me/project/guide.pdf", ["/Users/Me/Project"]),
    ).toBe(true);
  });

  it("folds case on Windows", () => {
    stubPlatform("win32");
    expect(workspacePathsEqual("C:\\Users\\Me", "c:\\users\\me")).toBe(true);
    expect(isPathWithinRoots("c:/users/me/a.pdf", ["C:/Users/Me"])).toBe(true);
  });

  it("stays case-sensitive on Linux", () => {
    stubPlatform("linux");
    expect(workspacePathsEqual("/home/Me/Project", "/home/me/project")).toBe(
      false,
    );
    expect(
      isPathWithinRoots("/home/me/project/guide.pdf", ["/home/Me/Project"]),
    ).toBe(false);
  });

  it("falls back to navigator.platform when process is absent", () => {
    vi.stubGlobal("process", undefined);
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(workspacePathsEqual("/Users/Me/Project", "/users/me/project")).toBe(
      true,
    );
    vi.stubGlobal("navigator", { platform: "Linux x86_64" });
    expect(workspacePathsEqual("/home/Me/Project", "/home/me/project")).toBe(
      false,
    );
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
