import { describe, expect, it } from "vitest";
import {
  getDisplayDirectory,
  getWorkspaceRelativePath,
  withoutWorkspaceCd,
} from "./tool-call-display-path";

const POSIX_ROOT = "/Users/me/repo";
const WINDOWS_ROOT = "C:\\Users\\me\\repo";

describe("getWorkspaceRelativePath", () => {
  it.each([
    [
      "/Users/me/repo/crates/core/README.md",
      POSIX_ROOT,
      "crates/core/README.md",
    ],
    ["/Users/me/repo", "/Users/me/repo/", ""],
    ["/Users/me/repo-other/a.ts", POSIX_ROOT, null],
    ["/Users/me/Repo/a.ts", POSIX_ROOT, null],
    ["/elsewhere/a.ts", POSIX_ROOT, null],
    ["/Users/me/repo/a.ts", null, null],
  ])("%s under %s", (filePath, root, expected) => {
    expect(getWorkspaceRelativePath(filePath, root)).toBe(expected);
  });

  it("compares Windows paths case-insensitively with either separator", () => {
    expect(
      getWorkspaceRelativePath("c:/users/me/repo\\src\\main.rs", WINDOWS_ROOT),
    ).toBe("src/main.rs");
    expect(getWorkspaceRelativePath("D:\\repo\\a.ts", WINDOWS_ROOT)).toBeNull();
  });
});

describe("getDisplayDirectory", () => {
  it("hides the directory of a file at the workspace root", () => {
    expect(getDisplayDirectory("/Users/me/repo/Cargo.toml", POSIX_ROOT)).toBe(
      null,
    );
  });

  it("shows a nested directory relative to the workspace", () => {
    expect(
      getDisplayDirectory("/Users/me/repo/crates/core/README.md", POSIX_ROOT),
    ).toBe("crates/core");
  });

  it("keeps the absolute directory outside the workspace", () => {
    expect(getDisplayDirectory("/etc/hosts", POSIX_ROOT)).toBe("/etc");
    expect(getDisplayDirectory("/Users/me/repo/a.ts", null)).toBe(
      "/Users/me/repo",
    );
  });
});

describe("withoutWorkspaceCd", () => {
  it.each([
    [`cd ${POSIX_ROOT} && git log --oneline -15`, "git log --oneline -15"],
    [`cd "${POSIX_ROOT}" && ls`, "ls"],
    [`cd '${POSIX_ROOT}/' && ls && pwd`, "ls && pwd"],
  ])("strips a cd into the workspace: %s", (command, expected) => {
    expect(withoutWorkspaceCd(command, POSIX_ROOT)).toBe(expected);
  });

  it.each([
    `cd ${POSIX_ROOT}/crates/core && cargo test`,
    "cd /tmp && ls",
    `cd ${POSIX_ROOT}; ls`,
    `cd ${POSIX_ROOT}`,
    `cd ${POSIX_ROOT} && `,
    "cd ~/repo && ls",
    `echo ok && cd ${POSIX_ROOT} && ls`,
  ])("keeps meaningful or unknown targets: %s", (command) => {
    expect(withoutWorkspaceCd(command, POSIX_ROOT)).toBe(command);
  });

  it("keeps the command when the session directory is unknown", () => {
    const command = `cd ${POSIX_ROOT} && ls`;
    expect(withoutWorkspaceCd(command, null)).toBe(command);
  });

  it("strips cmd's cd /d into a Windows workspace", () => {
    expect(
      withoutWorkspaceCd(`cd /d "c:\\users\\me\\repo" && dir`, WINDOWS_ROOT),
    ).toBe("dir");
  });
});
