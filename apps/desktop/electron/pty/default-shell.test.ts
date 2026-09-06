import { describe, expect, it } from "vitest";
import { resolveDefaultShell } from "./default-shell";

describe("resolveDefaultShell", () => {
  it("uses COMSPEC on Windows", () => {
    expect(
      resolveDefaultShell("win32", {
        COMSPEC: "C:\\Windows\\System32\\cmd.exe",
      }),
    ).toBe("C:\\Windows\\System32\\cmd.exe");
  });

  it("falls back to powershell.exe on Windows", () => {
    expect(resolveDefaultShell("win32", {})).toBe("powershell.exe");
  });

  it("prefers SHELL on POSIX platforms", () => {
    expect(resolveDefaultShell("darwin", { SHELL: "/bin/bash" })).toBe(
      "/bin/bash",
    );
    expect(resolveDefaultShell("linux", { SHELL: "/usr/bin/fish" })).toBe(
      "/usr/bin/fish",
    );
  });

  it("falls back to zsh on macOS and bash on Linux", () => {
    expect(resolveDefaultShell("darwin", {})).toBe("/bin/zsh");
    expect(resolveDefaultShell("linux", {})).toBe("/bin/bash");
  });
});
