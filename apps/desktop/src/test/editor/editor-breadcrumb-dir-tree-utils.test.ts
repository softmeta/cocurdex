import { describe, expect, it } from "vitest";
import {
  getBreadcrumbTreeTarget,
  getSubtreePaths,
  resolveBreadcrumbSelectedFilePath,
  type SubtreeEntry,
} from "@/features/editor/editor-breadcrumb-dir-tree-utils";

const entries: SubtreeEntry[] = [
  { kind: "file", relativePath: "README.md" },
  { kind: "directory", relativePath: "src" },
  { kind: "file", relativePath: "src/index.ts" },
  { kind: "directory", relativePath: "src/db" },
  { kind: "file", relativePath: "src/db/queries.ts" },
  { kind: "file", relativePath: "src/db/schema.ts" },
  { kind: "file", relativePath: "docs/guide.md" },
];

describe("getSubtreePaths", () => {
  it("returns all files relative to the workspace root for an empty dirPath", () => {
    expect(getSubtreePaths(entries, "")).toEqual([
      "README.md",
      "src/index.ts",
      "src/db/queries.ts",
      "src/db/schema.ts",
      "docs/guide.md",
    ]);
  });

  it("crops to a nested directory and rebases paths to it", () => {
    expect(getSubtreePaths(entries, "src/db")).toEqual([
      "queries.ts",
      "schema.ts",
    ]);
  });

  it("keeps nested files when cropping to an intermediate directory", () => {
    expect(getSubtreePaths(entries, "src")).toEqual([
      "index.ts",
      "db/queries.ts",
      "db/schema.ts",
    ]);
  });

  it("drops explicit directory records", () => {
    const result = getSubtreePaths(entries, "");
    expect(result).not.toContain("src");
    expect(result).not.toContain("src/db");
  });

  it("tolerates a trailing slash on dirPath", () => {
    expect(getSubtreePaths(entries, "src/db/")).toEqual([
      "queries.ts",
      "schema.ts",
    ]);
  });

  it("excludes entries that only share a name prefix, not a path boundary", () => {
    // "srcfoo/a.ts" must not match the "src" directory.
    const tricky: SubtreeEntry[] = [
      { kind: "file", relativePath: "src/a.ts" },
      { kind: "file", relativePath: "srcfoo/b.ts" },
    ];
    expect(getSubtreePaths(tricky, "src")).toEqual(["a.ts"]);
  });

  it("returns an empty array for an empty entry list", () => {
    expect(getSubtreePaths([], "src")).toEqual([]);
  });
});

describe("getBreadcrumbTreeTarget", () => {
  const segments = ["src", "db", "schema.ts"];

  it("roots a directory segment at its parent and selects that directory", () => {
    expect(getBreadcrumbTreeTarget(segments, 1)).toEqual({
      dirPath: "src",
      selectedPath: "db/",
    });
  });

  it("roots the first directory segment at the workspace root", () => {
    expect(getBreadcrumbTreeTarget(segments, 0)).toEqual({
      dirPath: "",
      selectedPath: "src/",
    });
  });

  it("roots the file segment at its parent and selects the file", () => {
    expect(getBreadcrumbTreeTarget(segments, 2)).toEqual({
      dirPath: "src/db",
      selectedPath: "schema.ts",
    });
  });
});

describe("resolveBreadcrumbSelectedFilePath", () => {
  it("returns an absolute file path for a selected file", () => {
    expect(
      resolveBreadcrumbSelectedFilePath("/repo", "src/db", "schema.ts"),
    ).toBe("/repo/src/db/schema.ts");
  });

  it("returns an absolute file path at the workspace root", () => {
    expect(resolveBreadcrumbSelectedFilePath("/repo", "", "README.md")).toBe(
      "/repo/README.md",
    );
  });

  it("ignores selected directories", () => {
    expect(resolveBreadcrumbSelectedFilePath("/repo", "src", "db/")).toBeNull();
  });

  it("ignores empty selections", () => {
    expect(resolveBreadcrumbSelectedFilePath("/repo", "src", "")).toBeNull();
  });
});
