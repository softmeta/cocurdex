import type { TurnChangeSet } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  fileOperationMarker,
  hasMeaningfulLineStats,
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

describe("hasMeaningfulLineStats", () => {
  it("shows header totals even when files lack per-file counts", () => {
    expect(
      hasMeaningfulLineStats({
        additions: 12,
        deletions: 3,
        files: [
          {
            operation: "modify",
            path: "src/a.ts",
            reviewKind: "text",
          },
        ],
      } as TurnChangeSet),
    ).toBe(true);
  });

  it("hides zero line counts", () => {
    expect(
      hasMeaningfulLineStats({
        additions: 0,
        deletions: 0,
        files: [
          {
            additions: 0,
            deletions: 0,
            operation: "modify",
            path: "src/a.ts",
            reviewKind: "text",
          },
        ],
      } as TurnChangeSet),
    ).toBe(false);
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
