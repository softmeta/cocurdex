import { describe, expect, it } from "vitest";
import {
  aggregateTurnFileChanges,
  applyContentLineStats,
  createUnifiedDiff,
  inferReviewKind,
  mergeNativeAndHostEvidence,
  parseUnifiedDiff,
  sumFileStats,
} from "./workspace-change-diff";
import type { TurnFileChange } from "./workspace-changes";

function file(
  path: string,
  overrides: Partial<TurnFileChange> = {},
): TurnFileChange {
  return {
    path,
    operation: "modify",
    reviewKind: inferReviewKind(path),
    ...overrides,
  };
}

describe("inferReviewKind", () => {
  it("classifies markdown as text and office files by family", () => {
    expect(inferReviewKind("notes/readme.md")).toBe("text");
    expect(inferReviewKind("spec.docx")).toBe("document");
    expect(inferReviewKind("budget.xlsx")).toBe("spreadsheet");
    expect(inferReviewKind("shot.png")).toBe("image");
    expect(inferReviewKind("blob.bin")).toBe("binary");
  });
});

describe("parseUnifiedDiff", () => {
  it("parses add, modify, and delete files from a turn-level diff", () => {
    const files = parseUnifiedDiff(`diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const a = 1;
+export const b = 2;
diff --git a/src/edit.ts b/src/edit.ts
--- a/src/edit.ts
+++ b/src/edit.ts
@@ -1,2 +1,2 @@
-const value = 1;
+const value = 2;
diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
--- a/src/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone
`);

    expect(files.map((entry) => [entry.path, entry.operation])).toEqual([
      ["src/edit.ts", "modify"],
      ["src/gone.ts", "delete"],
      ["src/new.ts", "add"],
    ]);
    expect(files.find((entry) => entry.path === "src/new.ts")?.additions).toBe(
      2,
    );
    expect(files.find((entry) => entry.path === "src/gone.ts")?.deletions).toBe(
      1,
    );
  });

  it("records a rename when git reports distinct old and new paths", () => {
    const files = parseUnifiedDiff(`diff --git a/old.md b/new.md
similarity index 100%
rename from old.md
rename to new.md
--- a/old.md
+++ b/new.md
`);
    expect(files).toEqual([
      expect.objectContaining({
        path: "new.md",
        previousPath: "old.md",
        operation: "rename",
      }),
    ]);
  });
});

describe("aggregateTurnFileChanges", () => {
  it("collapses repeated edits to the same path into one net change", () => {
    const files = aggregateTurnFileChanges([
      file("src/a.ts", {
        operation: "modify",
        additions: 2,
        deletions: 1,
        patch: "first",
        beforeHash: "before",
      }),
      file("src/a.ts", {
        operation: "modify",
        additions: 3,
        deletions: 0,
        patch: "second",
        afterHash: "after",
      }),
    ]);

    expect(files).toEqual([
      expect.objectContaining({
        path: "src/a.ts",
        operation: "modify",
        additions: 5,
        deletions: 1,
        patch: "second",
        beforeHash: "before",
        afterHash: "after",
      }),
    ]);
  });
});

describe("mergeNativeAndHostEvidence", () => {
  it("keeps the native patch for a shared path and host hashes for restore", () => {
    const merged = mergeNativeAndHostEvidence(
      [
        file("src/a.ts", {
          additions: 4,
          deletions: 1,
          patch: "native-patch",
          beforeHash: "hash-before",
          afterHash: "hash-after",
        }),
      ],
      [
        file("src/a.ts", {
          additions: 9,
          deletions: 9,
          beforeHash: "hash-before",
          afterHash: "hash-after",
        }),
      ],
      true,
    );

    expect(merged).toEqual([
      expect.objectContaining({
        path: "src/a.ts",
        patch: "native-patch",
        additions: 4,
        deletions: 1,
        beforeHash: "hash-before",
        afterHash: "hash-after",
      }),
    ]);
  });

  it("adds a host-only bash write that native evidence missed", () => {
    const merged = mergeNativeAndHostEvidence(
      [
        file("src/a.ts", {
          patch: "native-patch",
          beforeHash: "a0",
          afterHash: "a1",
        }),
      ],
      [
        file("src/a.ts", { beforeHash: "a0", afterHash: "a1" }),
        file("out.bin", {
          operation: "add",
          reviewKind: "binary",
          afterHash: "bin",
        }),
      ],
      true,
    );

    expect(merged.map((entry) => entry.path)).toEqual(["out.bin", "src/a.ts"]);
    expect(merged.find((entry) => entry.path === "out.bin")?.operation).toBe(
      "add",
    );
  });

  it("keeps a host rename instead of the native delete of the old path", () => {
    const merged = mergeNativeAndHostEvidence(
      [file("old.md", { operation: "delete", deletions: 3 })],
      [
        file("new.md", {
          operation: "rename",
          previousPath: "old.md",
          beforeHash: "same",
          afterHash: "same",
        }),
      ],
      true,
    );

    expect(merged).toEqual([
      expect.objectContaining({
        path: "new.md",
        operation: "rename",
        previousPath: "old.md",
      }),
    ]);
  });

  it("keeps the host operation when stale native evidence describes a different transition", () => {
    const merged = mergeNativeAndHostEvidence(
      [file("notes.md", { operation: "add", patch: "stale" })],
      [
        file("notes.md", {
          operation: "modify",
          beforeHash: "before",
          afterHash: "after",
        }),
      ],
      true,
    );

    expect(merged).toEqual([
      expect.objectContaining({
        path: "notes.md",
        operation: "modify",
        beforeHash: "before",
        afterHash: "after",
      }),
    ]);
    expect(merged[0]?.patch).toBeUndefined();
  });

  it("keeps the host patch when native evidence cannot prove the same content transition", () => {
    const merged = mergeNativeAndHostEvidence(
      [
        file("notes.md", {
          patch: "b-to-c",
          additions: 1,
          deletions: 1,
        }),
      ],
      [
        file("notes.md", {
          patch: "a-to-c",
          additions: 3,
          deletions: 2,
          beforeHash: "a",
          afterHash: "c",
        }),
      ],
      true,
    );

    expect(merged).toEqual([
      expect.objectContaining({
        path: "notes.md",
        patch: "a-to-c",
        additions: 3,
        deletions: 2,
      }),
    ]);
  });

  it("drops native-only files when the host checkpoint is the completeness authority", () => {
    const merged = mergeNativeAndHostEvidence(
      [file("stale.md", { operation: "add" })],
      [],
      true,
    );
    expect(merged).toEqual([]);
  });

  it("keeps native line stats when the host file has none", () => {
    const merged = mergeNativeAndHostEvidence(
      [file("src/a.ts", { additions: 4, deletions: 1 })],
      [file("src/a.ts", { beforeHash: "before", afterHash: "after" })],
      true,
    );

    expect(merged).toEqual([
      expect.objectContaining({
        path: "src/a.ts",
        additions: 4,
        deletions: 1,
        beforeHash: "before",
        afterHash: "after",
      }),
    ]);
  });

  it("uses native files when host coverage is unavailable", () => {
    const merged = mergeNativeAndHostEvidence(
      [file("only-native.ts", { patch: "native" })],
      [],
      false,
    );
    expect(merged).toEqual([
      expect.objectContaining({ path: "only-native.ts", patch: "native" }),
    ]);
  });
});

describe("createUnifiedDiff", () => {
  it("counts added and deleted lines around a shared prefix", () => {
    const result = createUnifiedDiff(
      "notes.md",
      "title\nold body\n",
      "title\nnew body\n",
    );
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.patch).toContain("+++ b/notes.md");
    expect(result.patch).toContain("-old body");
    expect(result.patch).toContain("+new body");
  });
});

describe("applyContentLineStats", () => {
  it("fills missing additions and deletions from before and after text", () => {
    expect(
      applyContentLineStats(file("src/a.ts"), "title\nold\n", "title\nnew\n"),
    ).toMatchObject({
      path: "src/a.ts",
      additions: 1,
      deletions: 1,
    });
  });

  it("leaves existing line stats and non-text files alone", () => {
    expect(
      applyContentLineStats(
        file("src/a.ts", { additions: 9, deletions: 2 }),
        "a\n",
        "b\n",
      ),
    ).toMatchObject({ additions: 9, deletions: 2 });
    expect(
      applyContentLineStats(
        file("shot.png", { reviewKind: "image" }),
        "a",
        "b",
      ),
    ).toMatchObject({ reviewKind: "image" });
  });
});

describe("sumFileStats", () => {
  it("sums available line stats and ignores binary files without them", () => {
    expect(
      sumFileStats([
        file("a.ts", { additions: 2, deletions: 1 }),
        file("b.png", { reviewKind: "image" }),
      ]),
    ).toEqual({ additions: 2, deletions: 1 });
  });
});
