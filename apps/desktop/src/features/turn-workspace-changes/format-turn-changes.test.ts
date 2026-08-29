import { describe, expect, it } from "vitest";
import {
  fileOperationMarker,
  splitWorkspaceRelativePath,
} from "./format-turn-changes";

describe("fileOperationMarker", () => {
  it("maps add, delete, rename, and modify to git-status letters", () => {
    expect(fileOperationMarker("add")).toEqual({
      className: "text-editor-git-added",
      letter: "A",
    });
    expect(fileOperationMarker("delete")).toEqual({
      className: "text-editor-git-deleted",
      letter: "D",
    });
    expect(fileOperationMarker("rename")).toEqual({
      className: "text-editor-git-modified",
      letter: "R",
    });
    expect(fileOperationMarker("modify")).toEqual({
      className: "text-editor-git-modified",
      letter: "M",
    });
  });
});

describe("splitWorkspaceRelativePath", () => {
  it("keeps the filename visible and truncates the directory", () => {
    expect(splitWorkspaceRelativePath("apps/cr-api/src/lib/stats.ts")).toEqual({
      dir: "apps/cr-api/src/lib/",
      name: "stats.ts",
    });
  });

  it("treats a bare filename as having no directory", () => {
    expect(splitWorkspaceRelativePath("README.md")).toEqual({
      dir: "",
      name: "README.md",
    });
  });
});
