import {
  collectFileLinkTargets,
  fileLinkHref,
  linkFilePaths,
  localFileLinkTarget,
  padInlineCode,
  parseFileLinkHref,
} from "@cocurdex/mobile/internal/markdown/file-links";
import { describe, expect, it } from "vitest";

const ROOT = "/repo";

describe("collectFileLinkTargets", () => {
  it("finds path-like inline code and local file links outside fences", () => {
    const markdown = [
      "Edit `src/cart.ts:42` and see [the spec](docs/spec.md#L3).",
      "Ignore `exec.LookPath`, [site](https://example.invalid), and [issue](cocurdex://issue/1).",
      "```",
      "`src/ignored.ts`",
      "```",
    ].join("\n");
    expect(collectFileLinkTargets(markdown, ROOT)).toEqual([
      { path: "/repo/src/cart.ts", line: 42 },
      { path: "/repo/docs/spec.md", line: 3 },
    ]);
  });

  it("keeps absolute paths and skips relative ones without a root", () => {
    expect(
      collectFileLinkTargets("`/etc/app.toml` and `src/a.ts`", null),
    ).toEqual([{ path: "/etc/app.toml", line: null }]);
  });
});

describe("linkFilePaths", () => {
  it("links only the paths that exist and keeps the visible text", () => {
    const markdown = "Open `src/cart.ts:42`, not `src/gone.ts`.";
    const linked = linkFilePaths(
      markdown,
      ROOT,
      new Set(["/repo/src/cart.ts"]),
    );
    expect(linked).toBe(
      `Open [\`src/cart.ts:42\`](${fileLinkHref({ path: "/repo/src/cart.ts", line: 42 })}), not \`src/gone.ts\`.`,
    );
  });

  it("rewrites a local link's target and keeps its label", () => {
    const linked = linkFilePaths(
      "[`spec.md`](docs/spec.md)",
      ROOT,
      new Set(["/repo/docs/spec.md"]),
    );
    expect(parseFileLinkHref(/\]\((.+)\)$/.exec(linked)?.[1] ?? "")).toEqual({
      path: "/repo/docs/spec.md",
      line: null,
    });
    expect(linked.startsWith("[`spec.md`](")).toBe(true);
  });
});

describe("file link hrefs", () => {
  it("round-trips paths with spaces and Windows separators", () => {
    for (const target of [
      { path: "/repo/a b/c.ts", line: 7 },
      { path: "C:\\repo\\c.ts", line: null },
    ]) {
      expect(parseFileLinkHref(fileLinkHref(target))).toEqual(target);
    }
  });

  it("ignores other links", () => {
    expect(parseFileLinkHref("https://example.invalid")).toBeNull();
  });
});

describe("localFileLinkTarget", () => {
  it("opens an agent's local path link before its existence is known", () => {
    expect(localFileLinkTarget("/repo/src/agent-loop.ts:172", ROOT)).toEqual({
      path: "/repo/src/agent-loop.ts",
      line: 172,
    });
    expect(localFileLinkTarget("src/cart.ts", ROOT)).toEqual({
      path: "/repo/src/cart.ts",
      line: null,
    });
  });

  it("keeps resolved file links and ignores web links", () => {
    const target = { path: "/repo/a.ts", line: 3 };
    expect(localFileLinkTarget(fileLinkHref(target), ROOT)).toEqual(target);
    expect(
      localFileLinkTarget("https://example.invalid/a.ts", ROOT),
    ).toBeNull();
    expect(localFileLinkTarget("#heading", ROOT)).toBeNull();
  });
});

describe("padInlineCode", () => {
  const pad = "\u202f\u202f";

  it("pads inline code and linked inline code but leaves fences alone", () => {
    const markdown = [
      "Run `pnpm test` in [`src/a.ts`](cocurdex-file:?path=a).",
      "```",
      "`kept`",
      "```",
    ].join("\n");
    expect(padInlineCode(markdown)).toBe(
      [
        `Run \`${pad}pnpm test${pad}\` in [\`${pad}src/a.ts${pad}\`](cocurdex-file:?path=a).`,
        "```",
        "`kept`",
        "```",
      ].join("\n"),
    );
  });

  it("leaves link labels without code untouched", () => {
    expect(padInlineCode("[docs](https://example.invalid)")).toBe(
      "[docs](https://example.invalid)",
    );
  });
});
