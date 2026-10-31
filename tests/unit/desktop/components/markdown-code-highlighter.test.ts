import { describe, expect, it } from "vitest";
import { loadMarkdownCodeHighlighter } from "@/components/markdown-code-highlighter";

const themes = ["github-light-default", "github-dark-default"] as const;

describe("markdown code highlighter", () => {
  it("returns tokens synchronously with the dark theme in --shiki-dark", async () => {
    const plugin = await loadMarkdownCodeHighlighter();
    const result = plugin.highlight({
      code: "const a = 1;\nlet b;",
      language: "ts" as never,
      themes: [...themes],
    });
    expect(result?.tokens).toHaveLength(2);
    const keyword = result?.tokens[0]?.[0];
    expect(keyword?.content).toBe("const ");
    expect(keyword?.htmlStyle).toMatchObject({
      color: expect.stringMatching(/^#/),
      "--shiki-dark": expect.stringMatching(/^#/),
    });
  });

  it("renders unknown languages as plain text", async () => {
    const plugin = await loadMarkdownCodeHighlighter();
    expect(plugin.supportsLanguage("not-a-language" as never)).toBe(false);
    const result = plugin.highlight({
      code: "if (x) { y }",
      language: "not-a-language" as never,
      themes: [...themes],
    });
    expect(result?.tokens[0]?.map((token) => token.content).join("")).toBe(
      "if (x) { y }",
    );
    expect(
      new Set(result?.tokens[0]?.map((token) => token.htmlStyle?.color)).size,
    ).toBe(1);
  });
});
