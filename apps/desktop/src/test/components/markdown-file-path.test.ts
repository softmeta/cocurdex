import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  buildWorkspaceFileHref,
  extractInlineCodeText,
  parseFilePathCandidate,
  parseWorkspaceFileHref,
  rewriteMarkdownLocalFileLinks,
  scanFilePathCandidates,
  splitWorkspaceLinkLabel,
} from "@/components/markdown-file-path";

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

describe("extractInlineCodeText", () => {
  it("returns a plain string child", () => {
    expect(extractInlineCodeText("a/b.ts")).toBe("a/b.ts");
  });

  it("joins an array of string children", () => {
    expect(extractInlineCodeText(["a/", "b.ts"])).toBe("a/b.ts");
  });

  it("returns null for non-text children", () => {
    expect(
      extractInlineCodeText([{ type: "span" }] as unknown as ReactNode),
    ).toBeNull();
    expect(extractInlineCodeText(undefined)).toBeNull();
  });
});

describe("workspace file markdown links", () => {
  it("round-trips path + line + column through the private href", () => {
    const href = buildWorkspaceFileHref({
      path: "crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md",
      startLine: 12,
      column: 3,
    });
    expect(href.startsWith("https://cocurdex.workspace/open?")).toBe(true);
    expect(parseWorkspaceFileHref(href)).toEqual({
      path: "crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md",
      startLine: 12,
      column: 3,
    });
  });

  it("rejects ordinary https links", () => {
    expect(
      parseWorkspaceFileHref("https://example.com/open?path=a.ts"),
    ).toBeNull();
  });

  it("rewrites bare relative markdown file links", () => {
    const input =
      "后者见 [mode.md](crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md)。";
    const out = rewriteMarkdownLocalFileLinks(input);
    expect(out).toContain("https://cocurdex.workspace/open?path=");
    expect(out).toContain(
      encodeURIComponent(
        "crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md",
      ).replace(/%2F/g, "%2F"),
    );
    // URLSearchParams encodes `/` as `%2F` — just assert the path is recoverable.
    const hrefMatch = out.match(
      /\((https:\/\/cocurdex\.workspace\/open\?[^)]+)\)/,
    );
    expect(hrefMatch).not.toBeNull();
    expect(parseWorkspaceFileHref(hrefMatch?.[1])).toEqual({
      path: "crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md",
    });
  });

  it("leaves real web links and code spans alone", () => {
    const input = [
      "see [docs](https://example.com/a.md) and `[local](src/a.ts)`",
      "",
      "```md",
      "[keep](src/b.ts)",
      "```",
    ].join("\n");
    expect(rewriteMarkdownLocalFileLinks(input)).toBe(input);
  });

  it("rewrites GitHub-style file links with backtick labels", () => {
    // Common agent transcript form: [`path`](path)
    const input =
      "CLI 参数：[`crates/codegen/xai-grok-pager/src/app/cli.rs`](crates/codegen/xai-grok-pager/src/app/cli.rs)\n" +
      "后者见 [`docs/user-guide/15-agent-mode.md`](crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md)。";
    const out = rewriteMarkdownLocalFileLinks(input);
    expect(out).not.toContain("](crates/");
    const hrefs = [
      ...out.matchAll(/\((https:\/\/cocurdex\.workspace\/open\?[^)]+)\)/g),
    ].map((m) => m[1]);
    expect(hrefs).toHaveLength(2);
    expect(parseWorkspaceFileHref(hrefs[0])).toEqual({
      path: "crates/codegen/xai-grok-pager/src/app/cli.rs",
    });
    expect(parseWorkspaceFileHref(hrefs[1])).toEqual({
      path: "crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md",
    });
    // Label backticks preserved for chip rendering.
    expect(out).toContain(
      "[`crates/codegen/xai-grok-pager/src/app/cli.rs`](https://cocurdex.workspace/",
    );
  });

  it("rewrites paths with :line suffixes", () => {
    const out = rewriteMarkdownLocalFileLinks(
      "jump [here](apps/desktop/src/index.ts:42)",
    );
    const hrefMatch = out.match(
      /\((https:\/\/cocurdex\.workspace\/open\?[^)]+)\)/,
    );
    expect(parseWorkspaceFileHref(hrefMatch?.[1])).toEqual({
      path: "apps/desktop/src/index.ts",
      startLine: 42,
    });
  });
});

describe("splitWorkspaceLinkLabel", () => {
  it("keeps Chinese annotations outside the path chip", () => {
    expect(splitWorkspaceLinkLabel("headless.rs:846 附近")).toEqual([
      { kind: "path", text: "headless.rs:846", startLine: 846 },
      { kind: "text", text: " 附近" },
    ]);
    expect(splitWorkspaceLinkLabel("headless.rs:1240 起")).toEqual([
      { kind: "path", text: "headless.rs:1240", startLine: 1240 },
      { kind: "text", text: " 起" },
    ]);
  });

  it("keeps a pure path label as a single path part", () => {
    expect(
      splitWorkspaceLinkLabel("crates/codegen/xai-grok-pager/src/app/cli.rs"),
    ).toEqual([
      {
        kind: "path",
        text: "crates/codegen/xai-grok-pager/src/app/cli.rs",
      },
    ]);
  });

  it("treats a non-path label as a single path display part", () => {
    expect(splitWorkspaceLinkLabel("see docs")).toEqual([
      { kind: "path", text: "see docs" },
    ]);
  });
});
