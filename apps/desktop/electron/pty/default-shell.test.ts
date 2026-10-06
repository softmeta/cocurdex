import { describe, expect, it } from "vitest";
import { defaultShellArgs, resolveDefaultShell } from "./default-shell";

const WINDOWS_POWERSHELL_DIR = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0";
const PWSH_DIR = "C:\\Program Files\\PowerShell\\7";

function existing(...files: string[]) {
  const set = new Set(files);
  return (filePath: string) => set.has(filePath);
}

describe("resolveDefaultShell", () => {
  it("prefers PowerShell 7 on Windows when it is on PATH", () => {
    expect(
      resolveDefaultShell(
        "win32",
        {
          Path: `${WINDOWS_POWERSHELL_DIR};${PWSH_DIR}`,
          ComSpec: "C:\\Windows\\System32\\cmd.exe",
        },
        existing(
          `${PWSH_DIR}\\pwsh.exe`,
          `${WINDOWS_POWERSHELL_DIR}\\powershell.exe`,
        ),
      ),
    ).toBe(`${PWSH_DIR}\\pwsh.exe`);
  });

  it("uses Windows PowerShell before cmd.exe", () => {
    expect(
      resolveDefaultShell(
        "win32",
        {
          Path: WINDOWS_POWERSHELL_DIR,
          ComSpec: "C:\\Windows\\System32\\cmd.exe",
        },
        existing(`${WINDOWS_POWERSHELL_DIR}\\powershell.exe`),
      ),
    ).toBe(`${WINDOWS_POWERSHELL_DIR}\\powershell.exe`);
  });

  it("falls back to ComSpec when no PowerShell is on PATH", () => {
    expect(
      resolveDefaultShell(
        "win32",
        { Path: "C:\\tools", ComSpec: "C:\\Windows\\System32\\cmd.exe" },
        existing(),
      ),
    ).toBe("C:\\Windows\\System32\\cmd.exe");
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

describe("defaultShellArgs", () => {
  it("starts POSIX shells as login shells", () => {
    expect(defaultShellArgs("linux", "/bin/bash")).toEqual(["-l"]);
  });

  it("hides the PowerShell banner and passes nothing to cmd.exe", () => {
    expect(defaultShellArgs("win32", `${PWSH_DIR}\\pwsh.exe`)).toEqual([
      "-NoLogo",
    ]);
    expect(defaultShellArgs("win32", "C:\\Windows\\System32\\cmd.exe")).toEqual(
      [],
    );
  });
});
