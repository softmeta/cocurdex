import { afterEach, describe, expect, it } from "vitest";
import {
  clearFileTreeExpandedPaths,
  collectDirectoryPaths,
  getFileTreeExpandedPaths,
  resolveExpandedPathsForReset,
  setFileTreeExpandedPaths,
} from "@/features/editor/file-tree-expansion";

describe("collectDirectoryPaths", () => {
  it("collects ancestor directories for files and self for dirs", () => {
    expect(
      collectDirectoryPaths([
        "src/index.ts",
        "src/components/Button.tsx",
        "docs/",
        "docs/guide.md",
      ]).sort(),
    ).toEqual(["docs/", "src/", "src/components/"].sort());
  });

  it("ignores empty paths", () => {
    expect(collectDirectoryPaths(["", "/"])).toEqual([]);
  });
});

describe("resolveExpandedPathsForReset", () => {
  it("prefers live expansion over the session cache", () => {
    expect(resolveExpandedPathsForReset(["src/"], ["src/", "apps/"])).toEqual([
      "src/",
    ]);
  });

  it("falls back to the session cache when the model is empty", () => {
    expect(resolveExpandedPathsForReset([], ["src/lib/"])).toEqual([
      "src/lib/",
    ]);
  });

  it("returns undefined when neither source has expansion", () => {
    expect(resolveExpandedPathsForReset([], [])).toBeUndefined();
  });
});

describe("file tree expansion session cache", () => {
  afterEach(() => {
    clearFileTreeExpandedPaths();
  });

  it("stores and clears per-root expansion", () => {
    setFileTreeExpandedPaths("/repo-a", ["src/"]);
    setFileTreeExpandedPaths("/repo-b", ["apps/"]);
    expect(getFileTreeExpandedPaths("/repo-a")).toEqual(["src/"]);
    expect(getFileTreeExpandedPaths("/repo-b")).toEqual(["apps/"]);

    setFileTreeExpandedPaths("/repo-a", []);
    expect(getFileTreeExpandedPaths("/repo-a")).toEqual([]);
    expect(getFileTreeExpandedPaths("/repo-b")).toEqual(["apps/"]);
  });
});
