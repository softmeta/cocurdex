import { describe, expect, it } from "vitest";
import {
  mergeLoadedDirectories,
  withDirectoryChildren,
} from "@/features/editor/file-tree-directory-entries";

function entry(relativePath: string, kind: "directory" | "file") {
  return {
    kind,
    name: relativePath.split("/").at(-1) ?? relativePath,
    path: `/repo/${relativePath}`,
    relativePath,
  };
}

function paths(entries: readonly { relativePath: string }[]) {
  return entries.map((item) => item.relativePath);
}

describe("mergeLoadedDirectories", () => {
  it("adds the children a capped listing left out of an expanded folder", () => {
    const base = [
      entry("src", "directory"),
      entry("src/auth", "directory"),
      entry("src/index.ts", "file"),
    ];
    const loaded = withDirectoryChildren(null, "src/auth/", [
      entry("src/auth/nested", "directory"),
      entry("src/auth/token.ts", "file"),
    ]);

    expect(paths(mergeLoadedDirectories(base, loaded))).toEqual([
      "src",
      "src/auth",
      "src/index.ts",
      "src/auth/nested",
      "src/auth/token.ts",
    ]);
  });

  it("keeps the base listing as is when nothing is missing", () => {
    const base = [entry("src", "directory"), entry("src/index.ts", "file")];

    expect(mergeLoadedDirectories(base, null)).toBe(base);
    expect(
      mergeLoadedDirectories(
        base,
        withDirectoryChildren(null, "src/", [entry("src/index.ts", "file")]),
      ),
    ).toBe(base);
  });

  it("keeps loaded folders when the base listing is replaced", () => {
    const loaded = withDirectoryChildren(null, "zzz/", [
      entry("zzz/auth", "directory"),
      entry("zzz/README.md", "file"),
    ]);
    const refreshedBase = [entry("zzz", "directory")];

    expect(paths(mergeLoadedDirectories(refreshedBase, loaded))).toEqual([
      "zzz",
      "zzz/auth",
      "zzz/README.md",
    ]);
  });
});

describe("withDirectoryChildren", () => {
  const loaded = withDirectoryChildren(
    withDirectoryChildren(null, "zzz/", [
      entry("zzz/auth", "directory"),
      entry("zzz/README.md", "file"),
    ]),
    "zzz/auth/",
    [entry("zzz/auth/token.ts", "file")],
  );

  it("replaces a reloaded folder's children instead of keeping removed ones", () => {
    const next = withDirectoryChildren(loaded, "zzz/auth/", [
      entry("zzz/auth/session.ts", "file"),
    ]);

    expect(paths(mergeLoadedDirectories([], next))).toEqual([
      "zzz/auth",
      "zzz/README.md",
      "zzz/auth/session.ts",
    ]);
  });

  it("drops loaded subfolders that the parent no longer lists", () => {
    const next = withDirectoryChildren(loaded, "zzz/", [
      entry("zzz/README.md", "file"),
    ]);

    expect(paths(mergeLoadedDirectories([], next))).toEqual(["zzz/README.md"]);
  });

  it("drops a folder and its subfolders when it can no longer be read", () => {
    const next = withDirectoryChildren(loaded, "zzz/", null);

    expect(next.size).toBe(0);
  });
});
