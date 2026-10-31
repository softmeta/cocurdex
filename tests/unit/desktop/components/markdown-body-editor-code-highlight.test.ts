import { getNoteDocSchema, parseNoteMarkdown } from "@cocurdex/note-doc";
import { describe, expect, it } from "vitest";
import { buildCodeHighlightDecorations } from "@/components/markdown-body-editor/code-block/code-highlight-decorations";
import {
  type CodeTokenizer,
  loadCodeLanguage,
  tokenizeCode,
} from "@/components/markdown-body-editor/code-block/code-highlighter";
import {
  codeLanguageLabel,
  highlightLanguage,
} from "@/components/markdown-body-editor/code-block/code-languages";

function docOf(markdown: string) {
  return getNoteDocSchema().nodeFromJSON(parseNoteMarkdown(markdown));
}

const keywordTokenizer: CodeTokenizer = (code) =>
  [...code.matchAll(/const/g)].map((match) => ({
    from: match.index,
    to: match.index + match[0].length,
    style: "--shiki-light:#d73a49;--shiki-dark:#f97583",
  }));

describe("buildCodeHighlightDecorations", () => {
  it("colors tokens at their positions inside each code block", () => {
    const doc = docOf("intro\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n");
    const { decorations, pendingLanguages } = buildCodeHighlightDecorations(
      doc,
      keywordTokenizer,
    );
    const texts = decorations
      .find()
      .map((decoration) => doc.textBetween(decoration.from, decoration.to));
    expect(texts).toEqual(["const", "const"]);
    expect(pendingLanguages).toEqual([]);
  });

  it("asks for languages that are not loaded yet and leaves plain blocks alone", () => {
    const doc = docOf("```python\nx = 1\n```\n\n```\nplain\n```\n");
    const tokenize: CodeTokenizer = () => null;
    const { decorations, pendingLanguages } = buildCodeHighlightDecorations(
      doc,
      tokenize,
    );
    expect(decorations.find()).toEqual([]);
    expect(pendingLanguages).toEqual(["python"]);
  });

  it("resolves fence aliases to the grammar they name", () => {
    const seen: string[] = [];
    const tokenize: CodeTokenizer = (_code, language) => {
      seen.push(language);
      return [];
    };
    buildCodeHighlightDecorations(
      docOf("```TS\na\n```\n\n```sh\nb\n```\n\n```svg\n<c/>\n```\n"),
      tokenize,
    );
    expect(seen).toEqual(["typescript", "bash", "xml"]);
  });
});

describe("code languages", () => {
  it("labels known languages and keeps unknown fence names", () => {
    expect(codeLanguageLabel("py")).toBe("Python");
    expect(codeLanguageLabel("zig")).toBe("zig");
    expect(highlightLanguage(" Zig ")).toBe("zig");
  });
});

describe("tokenizeCode", () => {
  it("styles supported languages with light and dark CSS variables", async () => {
    expect(await loadCodeLanguage("ts")).toBe(true);
    const tokens = tokenizeCode("const a = 1;", "ts") ?? [];
    const keyword = tokens.find((token) => token.from === 0);
    expect(keyword?.to).toBe(6);
    expect(keyword?.style).toMatch(/--shiki-light:#[0-9a-f]{6}/);
    expect(keyword?.style).toMatch(/--shiki-dark:#[0-9a-f]{6}/);
  });

  it("leaves unsupported languages unstyled", async () => {
    expect(await loadCodeLanguage("not-a-language")).toBe(false);
    expect(tokenizeCode("x = 1", "not-a-language")).toEqual([]);
  });
});
