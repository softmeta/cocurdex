import { describe, expect, it } from "vitest";
import { listExtractCommands } from "./acp-registry-install";

describe("listExtractCommands", () => {
  it("uses the Windows system bsdtar so a Git Bash GNU tar on PATH is never picked", () => {
    expect(
      listExtractCommands(
        "zip",
        "C:\\tmp\\agent.zip",
        "C:\\tmp\\agent",
        "win32",
        { SystemRoot: "D:\\Windows" },
      ),
    ).toEqual([
      {
        command: "D:\\Windows\\System32\\tar.exe",
        args: ["-xf", "C:\\tmp\\agent.zip", "-C", "C:\\tmp\\agent"],
      },
    ]);
  });

  it("falls back from unzip for zip archives on Linux", () => {
    expect(
      listExtractCommands("zip", "/tmp/a.zip", "/tmp/a", "linux", {}).map(
        (candidate) => candidate.command,
      ),
    ).toEqual(["unzip", "bsdtar", "python3"]);
  });

  it("uses tar for macOS archives and Linux tarballs", () => {
    expect(
      listExtractCommands("zip", "/tmp/a.zip", "/tmp/a", "darwin", {}),
    ).toEqual([
      { command: "tar", args: ["-xf", "/tmp/a.zip", "-C", "/tmp/a"] },
    ]);
    expect(
      listExtractCommands("tar", "/tmp/a.tgz", "/tmp/a", "linux", {}),
    ).toEqual([
      { command: "tar", args: ["-xf", "/tmp/a.tgz", "-C", "/tmp/a"] },
    ]);
  });
});
