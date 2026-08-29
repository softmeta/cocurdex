import { describe, expect, it } from "vitest";
import {
  extractPiEditEvidence,
  extractPiEditSnapshot,
  openCodeDiffsToEvidence,
  unifiedDiffToEvidence,
} from "./native-evidence";

describe("native workspace evidence", () => {
  it("parses a Codex turn-level unified diff", () => {
    const evidence = unifiedDiffToEvidence(
      "codex-turn-diff",
      "provider-file-tools",
      `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new
`,
      { providerTurnId: "turn-1" },
    );
    expect(evidence.files[0]).toMatchObject({
      path: "src/a.ts",
      operation: "modify",
      patch: expect.stringContaining("+new"),
    });
    expect(evidence.providerTurnId).toBe("turn-1");
  });

  it("normalizes OpenCode file diffs into a turn change list", () => {
    const evidence = openCodeDiffsToEvidence([
      {
        file: "notes.md",
        before: "a\n",
        after: "b\n",
        additions: 1,
        deletions: 1,
        status: "modified",
      },
    ]);
    expect(evidence.source).toBe("opencode-session-diff");
    expect(evidence.files[0]?.path).toBe("notes.md");
    expect(evidence.files[0]?.patch).toContain("+b");
  });

  it("extracts a Pi Edit unified patch from the tool result", () => {
    const file = extractPiEditEvidence({
      path: "src/a.ts",
      details: {
        patch: `--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new
`,
      },
    });
    expect(file).toMatchObject({
      path: "src/a.ts",
      operation: "modify",
    });
  });

  it("treats an empty Codex snapshot as authoritative empty native evidence", () => {
    const evidence = unifiedDiffToEvidence(
      "codex-turn-diff",
      "provider-file-tools",
      "",
      { providerTurnId: "turn-2" },
    );
    expect(evidence.files).toEqual([]);
    expect(evidence.providerTurnId).toBe("turn-2");
  });

  it("extracts Pi before and after text so repeated edits can be aggregated", () => {
    const snapshot = extractPiEditSnapshot({
      path: "src/a.ts",
      details: {
        before: "a\n",
        after: "b\n",
        patch: `--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-a
+b
`,
      },
    });
    expect(snapshot?.beforeText).toBe("a\n");
    expect(snapshot?.afterText).toBe("b\n");
    expect(snapshot?.file.path).toBe("src/a.ts");
  });

  it("preserves empty Pi before and after snapshots", () => {
    const added = extractPiEditSnapshot({
      path: "src/empty.ts",
      details: { before: "", after: "content\n", patch: "patch" },
    });
    const cleared = extractPiEditSnapshot({
      path: "src/empty.ts",
      details: { before: "content\n", after: "", patch: "patch" },
    });

    expect(added?.beforeText).toBe("");
    expect(added?.afterText).toBe("content\n");
    expect(cleared?.beforeText).toBe("content\n");
    expect(cleared?.afterText).toBe("");
  });
});
