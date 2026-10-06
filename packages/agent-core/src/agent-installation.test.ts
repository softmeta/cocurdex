import { describe, expect, it } from "vitest";
import { lookupExecutable } from "./agent-installation";

function fakeRun(stdout: string) {
  return async () => ({ stdout });
}

describe("lookupExecutable", () => {
  it("skips the extensionless npm sh shim that where.exe lists first", async () => {
    const stdout = [
      "C:\\Users\\dev\\AppData\\Roaming\\npm\\claude",
      "C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.cmd",
      "",
    ].join("\r\n");

    await expect(
      lookupExecutable("claude", {
        platform: "win32",
        env: { PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        run: fakeRun(stdout),
      }),
    ).resolves.toBe("C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.cmd");
  });

  it("returns null on Windows when no candidate has a PATHEXT extension", async () => {
    await expect(
      lookupExecutable("codex", {
        platform: "win32",
        env: {},
        run: fakeRun("C:\\tools\\codex\r\nC:\\tools\\codex.ps1\r\n"),
      }),
    ).resolves.toBeNull();
  });

  it("returns the first which result on POSIX", async () => {
    await expect(
      lookupExecutable("codex", {
        platform: "linux",
        env: {},
        run: fakeRun("/home/dev/.local/bin/codex\n/usr/bin/codex\n"),
      }),
    ).resolves.toBe("/home/dev/.local/bin/codex");
  });

  it("returns null when the lookup command fails", async () => {
    await expect(
      lookupExecutable("missing", {
        platform: "darwin",
        run: async () => {
          throw new Error("not found");
        },
      }),
    ).resolves.toBeNull();
  });
});
