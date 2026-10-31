import {
  parseFilePathCandidate,
  resolveCandidatePath,
  scanFilePathCandidates,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("parseFilePathCandidate", () => {
  it("accepts a repo-relative path with separators", () => {
    expect(parseFilePathCandidate("server/pkg/agent/claude.go")).toEqual({
      path: "server/pkg/agent/claude.go",
    });
  });

  it("accepts a bare filename with a known extension", () => {
    expect(parseFilePathCandidate("claude.go")).toEqual({ path: "claude.go" });
  });

  it("parses a trailing :line suffix", () => {
    expect(parseFilePathCandidate("claude.go:42")).toEqual({
      path: "claude.go",
      startLine: 42,
    });
  });

  it("parses a trailing :line:column suffix", () => {
    expect(parseFilePathCandidate("src/lib/ipc.ts:10:5")).toEqual({
      path: "src/lib/ipc.ts",
      startLine: 10,
      column: 5,
    });
  });

  it("parses a trailing :start-end range suffix", () => {
    expect(parseFilePathCandidate("service.ts:1544-1572")).toEqual({
      path: "service.ts",
      startLine: 1544,
      endLine: 1572,
    });
  });

  it("parses a range separated by an en dash", () => {
    expect(parseFilePathCandidate("src/service.ts:1544–1572")).toEqual({
      path: "src/service.ts",
      startLine: 1544,
      endLine: 1572,
    });
  });

  it("collapses a reversed range to its start line", () => {
    expect(parseFilePathCandidate("service.ts:1572-1544")).toEqual({
      path: "service.ts",
      startLine: 1572,
    });
  });

  it("accepts an absolute path", () => {
    expect(parseFilePathCandidate("/Users/x/app/main.ts")).toEqual({
      path: "/Users/x/app/main.ts",
    });
  });

  it.each([
    "buildClaudeArgs()",
    'exec.LookPath("claude")',
    "exec.LookPath",
    "npm run dev",
    "useEffect",
    "v1.2.3",
    "1.5",
    "12:30-13:00",
    "v1.2.3-rc1",
    "$SHELL",
    "--output-format",
  ])("rejects non-path inline code: %s", (raw) => {
    expect(parseFilePathCandidate(raw)).toBeNull();
  });

  it("rejects empty / whitespace", () => {
    expect(parseFilePathCandidate("   ")).toBeNull();
    expect(parseFilePathCandidate("")).toBeNull();
  });
});

describe("scanFilePathCandidates", () => {
  // Helper: assert a single match covering `slice` of `text` with the given candidate.
  function expectSingle(
    text: string,
    slice: string,
    candidate: ReturnType<typeof parseFilePathCandidate>,
  ) {
    const matches = scanFilePathCandidates(text);
    expect(matches).toHaveLength(1);
    const match = matches[0];
    expect(text.slice(match.index, match.index + match.length)).toBe(slice);
    expect(match.candidate).toEqual(candidate);
  }

  it("finds a path with :line suffix wrapped in full-width parens", () => {
    expectSingle(
      "关闭 — Session::shutdown()（core/src/session/handlers.rs:619）drain",
      "core/src/session/handlers.rs:619",
      { path: "core/src/session/handlers.rs", startLine: 619 },
    );
  });

  it("finds a path with a line range inside a Chinese sentence", () => {
    expectSingle("补丁落在 service.ts:1544-1572 附近", "service.ts:1544-1572", {
      path: "service.ts",
      startLine: 1544,
      endLine: 1572,
    });
  });

  it("finds a bare path without a line number", () => {
    expectSingle("see core/src/main.rs here", "core/src/main.rs", {
      path: "core/src/main.rs",
    });
  });

  it("finds a path wrapped in full-width parens without a line number", () => {
    expectSingle("（apps/desktop/src/index.ts）", "apps/desktop/src/index.ts", {
      path: "apps/desktop/src/index.ts",
    });
  });

  it("trims a trailing sentence period off the match", () => {
    expectSingle("edit foo/bar.ts:5.", "foo/bar.ts:5", {
      path: "foo/bar.ts",
      startLine: 5,
    });
  });

  it("finds multiple paths on one line", () => {
    const matches = scanFilePathCandidates("a/b.ts:1 and c/d.ts:2");
    expect(matches.map((m) => m.candidate)).toEqual([
      { path: "a/b.ts", startLine: 1 },
      { path: "c/d.ts", startLine: 2 },
    ]);
  });

  it.each([
    "aspect ratio 16:9 here",
    "meeting at 12:30 today",
    "call exec.LookPath now",
    "just plain prose without paths",
    "see https://example.com/path/to/page online",
  ])("ignores non-path text: %s", (text) => {
    expect(scanFilePathCandidates(text)).toEqual([]);
  });
});

describe("resolveCandidatePath", () => {
  it("keeps absolute POSIX and Windows paths", () => {
    expect(resolveCandidatePath("/repo/a.ts", "/other")).toBe("/repo/a.ts");
    expect(resolveCandidatePath("C:\\repo\\a.ts", null)).toBe("C:\\repo\\a.ts");
  });

  it("joins a relative path onto the root with its separator", () => {
    expect(resolveCandidatePath("./src/a.ts", "/repo/")).toBe("/repo/src/a.ts");
    expect(resolveCandidatePath("src/a.ts", "C:\\repo")).toBe(
      "C:\\repo\\src/a.ts",
    );
  });

  it("cannot resolve a relative path without a root", () => {
    expect(resolveCandidatePath("src/a.ts", null)).toBeNull();
  });
});
