import { describe, expect, it } from "vitest";
import { withAncestorDirectories } from "@/features/editor/file-tree-expansion";

describe("withAncestorDirectories", () => {
  it("loads every folder in an expanded chain, so a flattened row's parents fill in", () => {
    expect(withAncestorDirectories(["zzz/auth/"]).sort()).toEqual([
      "zzz/",
      "zzz/auth/",
    ]);
  });

  it("lists a shared ancestor once", () => {
    expect(
      withAncestorDirectories(["src/a/", "src/b/", "src/"]).sort(),
    ).toEqual(["src/", "src/a/", "src/b/"]);
  });
});
