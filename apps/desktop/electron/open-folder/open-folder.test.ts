import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractOpenFolderFromAdditionalData,
  extractOpenFolderFromArgv,
  OPEN_FOLDER_FLAG,
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
