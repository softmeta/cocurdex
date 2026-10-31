import { fileManagerCommands } from "@cocurdex/daemon/internal/system/file-manager";
import { describe, expect, it } from "vitest";

describe("fileManagerCommands", () => {
  it("opens and reveals with Finder on macOS", () => {
    expect(fileManagerCommands("open", "/Users/me/app", "darwin")).toEqual([
      { command: "open", args: ["/Users/me/app"] },
    ]);
    expect(
      fileManagerCommands("reveal", "/Users/me/app/a.ts", "darwin"),
    ).toEqual([{ command: "open", args: ["-R", "/Users/me/app/a.ts"] }]);
  });

  it("passes a verbatim quoted select argument to Explorer on Windows", () => {
    expect(
      fileManagerCommands("reveal", "C:\\My Projects\\a.ts", "win32"),
    ).toEqual([
      {
        command: "explorer.exe",
        args: ['/select,"C:\\My Projects\\a.ts"'],
        ignoreExitCode: true,
        verbatimArguments: true,
      },
    ]);
  });

  it("asks the desktop file manager to select the item on Linux before opening its folder", () => {
    const commands = fileManagerCommands(
      "reveal",
      "/home/me/my app/a.ts",
      "linux",
    );

    expect(commands.map((candidate) => candidate.command)).toEqual([
      "dbus-send",
      "xdg-open",
    ]);
    expect(commands[0]?.args).toContain(
      "array:string:file:///home/me/my%20app/a.ts",
    );
    expect(commands[1]?.args).toEqual(["/home/me/my app"]);
  });

  it("opens a folder with xdg-open on Linux", () => {
    expect(fileManagerCommands("open", "/home/me/app", "linux")).toEqual([
      { command: "xdg-open", args: ["/home/me/app"] },
    ]);
  });
});
