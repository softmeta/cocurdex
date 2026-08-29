import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractOpenFolderFromAdditionalData,
  extractOpenFolderFromArgv,
  OPEN_FOLDER_FLAG,
  resolveDroppedOpenPath,
} from "./open-folder";

describe("extractOpenFolderFromArgv", () => {
  it("returns null when the flag is absent", () => {
    expect(extractOpenFolderFromArgv(["electron", "."])).toBeNull();
    expect(extractOpenFolderFromArgv([])).toBeNull();
  });

  it("returns null when the flag has no path value", () => {
    expect(extractOpenFolderFromArgv([OPEN_FOLDER_FLAG])).toBeNull();
    expect(extractOpenFolderFromArgv([OPEN_FOLDER_FLAG, "--other"])).toBeNull();
  });

  it("resolves the path after the flag", () => {
    const result = extractOpenFolderFromArgv([
      "/app/Cocurdex",
      OPEN_FOLDER_FLAG,
      "/tmp/project",
    ]);
    expect(result).toBe(path.resolve("/tmp/project"));
  });

  it("resolves --open-folder=path form used by packaged CLI", () => {
    const result = extractOpenFolderFromArgv([
      "/Applications/Cocurdex.app/Contents/MacOS/Cocurdex",
      `${OPEN_FOLDER_FLAG}=/tmp/project`,
    ]);
    expect(result).toBe(path.resolve("/tmp/project"));
  });

  it("resolves relative paths against cwd", () => {
    const result = extractOpenFolderFromArgv([OPEN_FOLDER_FLAG, "."]);
    expect(result).toBe(path.resolve("."));
  });
});

describe("extractOpenFolderFromAdditionalData", () => {
  it("reads openFolder from second-instance additionalData", () => {
    expect(
      extractOpenFolderFromAdditionalData({
        openFolder: "/tmp/from-cli",
      }),
    ).toBe(path.resolve("/tmp/from-cli"));
  });

  it("returns null for missing or invalid payloads", () => {
    expect(extractOpenFolderFromAdditionalData(null)).toBeNull();
    expect(extractOpenFolderFromAdditionalData({})).toBeNull();
    expect(extractOpenFolderFromAdditionalData({ openFolder: 1 })).toBeNull();
  });
});

describe("resolveDroppedOpenPath", () => {
  it("returns the directory itself when a folder is dropped", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-drop-dir-"));
    const result = await resolveDroppedOpenPath(dir);
    // macOS realpath maps /var → /private/var; compare canonical forms.
    expect(result).toBe(await realpath(dir));
  });

  it("opens the parent directory when a file is dropped", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-drop-file-"));
    const filePath = path.join(dir, "readme.md");
    await writeFile(filePath, "hi");
    const result = await resolveDroppedOpenPath(filePath);
    expect(result).toBe(await realpath(dir));
  });

  it("returns null for a missing path", async () => {
    const result = await resolveDroppedOpenPath(
      path.join(tmpdir(), "cocurdex-drop-missing", "nope"),
    );
    expect(result).toBeNull();
  });

  it("reuses an existing workspace rootPath when paths match", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-drop-reuse-"));
    const stored = `${dir}${path.sep}`;
    const result = await resolveDroppedOpenPath(dir, [stored]);
    expect(result).toBe(stored);
  });
});
