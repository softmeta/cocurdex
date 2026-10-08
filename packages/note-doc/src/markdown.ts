import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { buildNoteDocExtensions } from "./schema";

const CODE_OR_ESCAPED_WIKILINK =
  /(^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\2[^\n]*$|`[^`\n]*`)|\\\[\\\[([^\n]*?)\\\]\\\]/gmu;

let manager: MarkdownManager | null = null;

function markdownManager(): MarkdownManager {
  manager ??= new MarkdownManager({ extensions: buildNoteDocExtensions() });
  return manager;
}

export function parseNoteMarkdown(markdown: string): JSONContent {
  return markdownManager().parse(markdown);
}

export function lexNoteMarkdownBlocks(markdown: string): string[] {
  return markdownManager()
    .instance.lexer(markdown)
    .map((token) => token.raw);
}

export function serializeNoteMarkdown(json: JSONContent): string {
  return unescapeWikilinks(markdownManager().serialize(json));
}

function unescapeWikilinks(markdown: string): string {
  return markdown.replace(
    CODE_OR_ESCAPED_WIKILINK,
    (_match, code: string | undefined, _fence, target: string | undefined) =>
      code ?? `[[${target}]]`,
  );
}
