import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSessionWorktreePath,
  getDaemonSocketPath,
  getDefaultUserDataPath,
  isAppManagedWorktreePath,
} from "./paths";

describe("getDefaultUserDataPath", () => {
  it("matches the Electron userData directory named after productName", () => {
    expect(getDefaultUserDataPath("darwin", {}, "/Users/example")).toBe(
      path.join("/Users/example", "Library", "Application Support", "Cocurdex"),
    );
    expect(getDefaultUserDataPath("win32", {}, "C:\\Users\\example")).toBe(
      path.join("C:\\Users\\example", "AppData", "Roaming", "Cocurdex"),
    );
    expect(getDefaultUserDataPath("linux", {}, "/home/example")).toBe(
      path.join("/home/example", ".config", "Cocurdex"),
    );
  });

  it("honors the platform data directory variables", () => {
    expect(
      getDefaultUserDataPath(
        "win32",
        { APPDATA: "D:\\Roaming" },
        "C:\\Users\\example",
      ),
    ).toBe(path.join("D:\\Roaming", "Cocurdex"));
    expect(
      getDefaultUserDataPath(
        "linux",
        { XDG_CONFIG_HOME: "/etc/cocurdex" },
        "/home/example",
      ),
    ).toBe(path.join("/etc/cocurdex", "Cocurdex"));
  });
});

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

const userDataPath = path.resolve("/tmp/cocurdex-data");
const customRootPath = path.resolve("/tmp/custom-worktrees");

describe("session worktree paths", () => {
  it("places session worktrees under app data, hashed by repo", () => {
    const first = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-1",
      userDataPath,
    });
    const second = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-2",
      userDataPath,
    });

    expect(first.startsWith(userDataPath)).toBe(true);
    expect(first).toContain("worktrees");
    expect(first.endsWith(path.join("wt-1", "project"))).toBe(true);
    expect(first.split(path.sep).at(-3)).toBe(second.split(path.sep).at(-3));
    expect(first.startsWith("/Users/example/project")).toBe(false);
  });

  it("recognizes only app-managed worktree paths", () => {
    const managed = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-1",
      userDataPath,
    });

    expect(isAppManagedWorktreePath(managed, userDataPath)).toBe(true);
    expect(
      isAppManagedWorktreePath("/Users/example/project", userDataPath),
    ).toBe(false);
  });

  it("treats both the default and configured roots as managed", () => {
    const configured = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-2",
      userDataPath,
      worktreeRootPath: customRootPath,
    });
    const legacy = createSessionWorktreePath({
      repoRootPath: "/Users/example/project",
      worktreeId: "wt-1",
      userDataPath,
    });

    expect(configured.startsWith(customRootPath)).toBe(true);
    expect(
      isAppManagedWorktreePath(configured, userDataPath, customRootPath),
    ).toBe(true);
    expect(isAppManagedWorktreePath(legacy, userDataPath, customRootPath)).toBe(
      true,
    );
  });
});
