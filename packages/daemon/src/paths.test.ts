import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSessionWorktreePath,
  getDaemonSocketPath,
  isAppManagedWorktreePath,
} from "./paths";

describe("getDaemonSocketPath", () => {
  it("uses a filesystem socket on macOS and Linux", () => {
    expect(getDaemonSocketPath("/tmp/cocurdex", "darwin")).toBe(
      "/tmp/cocurdex/daemon.sock",
    );
    expect(getDaemonSocketPath("/tmp/cocurdex", "linux")).toBe(
      "/tmp/cocurdex/daemon.sock",
    );
  });

  it("uses a profile-specific named pipe on Windows", () => {
    const first = getDaemonSocketPath("C:\\Users\\a\\Cocurdex", "win32");
    const second = getDaemonSocketPath("C:\\Users\\b\\Cocurdex", "win32");

    expect(first).toMatch(/^\\\\\.\\pipe\\cocurdex-daemon-[a-f0-9]{16}$/);
    expect(second).not.toBe(first);
  });
});

describe("session worktree paths", () => {
  it("places session worktrees under app data, hashed by repo", () => {
    const first = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-1",
      userDataPath: "/tmp/cocurdex-data",
    });
    const second = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-2",
      userDataPath: "/tmp/cocurdex-data",
    });

    expect(first.startsWith("/tmp/cocurdex-data")).toBe(true);
    expect(first).toContain("worktrees");
    expect(first.endsWith(path.join("wt-1"))).toBe(true);
    expect(first.split(path.sep).at(-2)).toBe(second.split(path.sep).at(-2));
    expect(first.startsWith("/Users/example/project")).toBe(false);
  });

  it("recognizes only app-managed worktree paths", () => {
    const managed = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-1",
      userDataPath: "/tmp/cocurdex-data",
    });

    expect(isAppManagedWorktreePath(managed, "/tmp/cocurdex-data")).toBe(true);
    expect(
      isAppManagedWorktreePath("/Users/example/project", "/tmp/cocurdex-data"),
    ).toBe(false);
  });

  it("treats both the default and configured roots as managed", () => {
    const configured = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-2",
      userDataPath: "/tmp/cocurdex-data",
      worktreeRootPath: "/tmp/custom-worktrees",
    });
    const legacy = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-1",
      userDataPath: "/tmp/cocurdex-data",
    });

    expect(configured.startsWith("/tmp/custom-worktrees")).toBe(true);
    expect(
      isAppManagedWorktreePath(
        configured,
        "/tmp/cocurdex-data",
        "/tmp/custom-worktrees",
      ),
    ).toBe(true);
    expect(
      isAppManagedWorktreePath(
        legacy,
        "/tmp/cocurdex-data",
        "/tmp/custom-worktrees",
      ),
    ).toBe(true);
  });
});
