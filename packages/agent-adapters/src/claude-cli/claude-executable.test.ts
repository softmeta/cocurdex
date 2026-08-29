import { describe, expect, it } from "vitest";
import { resolveClaudeSdkExecutablePath } from "./claude-executable";

const SHIM_PATH = "C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.cmd";

describe("resolveClaudeSdkExecutablePath", () => {
  it("returns the path unchanged on non-Windows platforms", () => {
    expect(
      resolveClaudeSdkExecutablePath("/usr/local/bin/claude", "darwin", () => {
        throw new Error("should not probe the filesystem");
      }),
    ).toBe("/usr/local/bin/claude");
  });

  it("returns the path unchanged when it is not a Windows launcher shim", () => {
    const nativePath = "C:\\Program Files\\claude\\claude.exe";
    expect(
      resolveClaudeSdkExecutablePath(nativePath, "win32", () => true),
    ).toBe(nativePath);
  });

  it("follows a launcher shim to the native package binary", () => {
    const nativeEntry =
      "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe";
    expect(
      resolveClaudeSdkExecutablePath(
        SHIM_PATH,
        "win32",
        (filePath) => filePath === nativeEntry,
      ),
    ).toBe(nativeEntry);
  });

  it("falls back to cli.js for older package versions", () => {
    const cliEntry =
      "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js";
    expect(
      resolveClaudeSdkExecutablePath(
        SHIM_PATH,
        "win32",
        (filePath) => filePath === cliEntry,
      ),
    ).toBe(cliEntry);
  });

  it("keeps the shim path when no package entry sits next to it", () => {
    expect(
      resolveClaudeSdkExecutablePath(SHIM_PATH, "win32", () => false),
    ).toBe(SHIM_PATH);
  });
});
