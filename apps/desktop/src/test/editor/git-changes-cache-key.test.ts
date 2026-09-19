import { areDiffTargetsEqual } from "@pierre/diffs";
import { describe, expect, it } from "vitest";
import {
  buildEntries,
  diffCacheKey,
  type GitChangeEntry,
} from "@/features/editor/git-changes-model";

function entryFor(oldContents: string, newContents: string): GitChangeEntry {
  const built = buildEntries([
    {
      path: "src/a.ts",
      changeType: "modified",
      oldContents,
      newContents,
      omittedReason: null,
      stagedState: "unstaged",
    },
  ]);
  return built[0] as GitChangeEntry;
}

describe("diffCacheKey", () => {
  it("keys a file version by its contents, not its path", () => {
    expect(diffCacheKey("src/a.ts", "a\nb\nc")).toBe(
      diffCacheKey("src/a.ts", "a\nb\nc"),
    );
    expect(diffCacheKey("src/a.ts", "a\nb\nc")).not.toBe(
      diffCacheKey("src/a.ts", "a\nb\ncd"),
    );
  });

  it("separates files that hold the same text", () => {
    expect(diffCacheKey("src/a.ts", "same")).not.toBe(
      diffCacheKey("src/b.ts", "same"),
    );
  });
});

describe("buildEntries diff identity", () => {
  it("changes the diff key when the file is edited, so pierre re-renders it", () => {
    const before = entryFor("a\nb\nc", "a\nB\nc");
    const after = entryFor("a\nb\nc\nd", "a\nB\nc\nD");

    expect(
      areDiffTargetsEqual(before.diff ?? undefined, after.diff ?? undefined),
    ).toBe(false);
  });

  it("keeps the diff key stable while the contents are unchanged", () => {
    const first = entryFor("a\nb\nc", "a\nB\nc");
    const second = entryFor("a\nb\nc", "a\nB\nc");

    expect(
      areDiffTargetsEqual(first.diff ?? undefined, second.diff ?? undefined),
    ).toBe(true);
  });
});
