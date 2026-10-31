import path from "node:path";
import {
  isPackagedAppBinary,
  resolveOpenFolderArg,
  shouldHandleAsOpen,
} from "@cocurdex/cli/internal/open-desktop";
import { describe, expect, it } from "vitest";

describe("shouldHandleAsOpen", () => {
  it("treats missing resource as open", () => {
    expect(shouldHandleAsOpen(undefined)).toBe(true);
  });

  it("treats explicit open subcommand as open", () => {
    expect(shouldHandleAsOpen("open")).toBe(true);
  });

  it("treats bare paths as open", () => {
    expect(shouldHandleAsOpen(".")).toBe(true);
    expect(shouldHandleAsOpen("./repo")).toBe(true);
    expect(shouldHandleAsOpen("/tmp/project")).toBe(true);
  });

  it("treats Windows paths as open only on Windows", () => {
    expect(shouldHandleAsOpen("C:\\repo", "win32")).toBe(true);
    expect(shouldHandleAsOpen("repo\\sub", "win32")).toBe(true);
    expect(shouldHandleAsOpen("repo\\sub", "linux")).toBe(false);
  });

  it("leaves bare words to subcommands, including ones added later", () => {
    for (const command of ["issue", "host", "team", "script-run", "web"]) {
      expect(shouldHandleAsOpen(command)).toBe(false);
    }
  });
});

describe("resolveOpenFolderArg", () => {
  it("returns undefined when opening the app only", () => {
    expect(resolveOpenFolderArg(undefined, undefined)).toBeUndefined();
    expect(resolveOpenFolderArg("open", undefined)).toBeUndefined();
  });

  it("returns the path for open <path>", () => {
    expect(resolveOpenFolderArg("open", ".")).toBe(".");
    expect(resolveOpenFolderArg("open", "/tmp/x")).toBe("/tmp/x");
  });

  it("returns the bare path argument", () => {
    expect(resolveOpenFolderArg(".", undefined)).toBe(".");
    expect(resolveOpenFolderArg("/tmp/x", undefined)).toBe("/tmp/x");
  });
});

describe("isPackagedAppBinary", () => {
  it("rejects electron from node_modules", () => {
    expect(
      isPackagedAppBinary(
        "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
      ),
    ).toBe(false);
    expect(
      isPackagedAppBinary(
        "C:\\repo\\node_modules\\electron\\dist\\electron.exe",
      ),
    ).toBe(false);
  });

  it("rejects bare electron binary names", () => {
    expect(isPackagedAppBinary("/usr/local/bin/electron")).toBe(false);
    expect(isPackagedAppBinary("C:\\tools\\electron.exe")).toBe(false);
  });

  it("accepts packaged Cocurdex binaries", () => {
    expect(
      isPackagedAppBinary("/Applications/Cocurdex.app/Contents/MacOS/Cocurdex"),
    ).toBe(true);
    expect(
      isPackagedAppBinary(
        path.win32.join("C:", "Program Files", "Cocurdex", "Cocurdex.exe"),
      ),
    ).toBe(true);
  });

  it("accepts the Linux AppImage file instead of its transient mount", () => {
    expect(
      isPackagedAppBinary("/home/me/Applications/Cocurdex-linux-x64.AppImage"),
    ).toBe(true);
  });
});
