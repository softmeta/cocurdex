import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  CODE_HIGHLIGHT_MAX_LENGTH,
  type CodeTokenizer,
} from "./code-highlighter";
import { highlightLanguage } from "./code-languages";

export const CODE_BLOCK_NODE = "codeBlock";

export interface CodeHighlightResult {
  decorations: DecorationSet;
  pendingLanguages: string[];
}

export function buildCodeHighlightDecorations(
  doc: ProseMirrorNode,
  tokenize: CodeTokenizer,
): CodeHighlightResult {
  const decorations: Decoration[] = [];
  const pendingLanguages = new Set<string>();
  doc.descendants((node, position) => {
    if (node.type.name !== CODE_BLOCK_NODE) return true;
    const language = highlightLanguage(node.attrs.language);
    const code = node.textContent;
    if (!language || code.length === 0) return false;
    if (code.length > CODE_HIGHLIGHT_MAX_LENGTH) return false;
    const tokens = tokenize(code, language);
    if (!tokens) {
      pendingLanguages.add(language);
      return false;
    }
    const start = position + 1;
    for (const token of tokens) {
      decorations.push(
        Decoration.inline(start + token.from, start + token.to, {
          style: token.style,
        }),
      );
    }
    return false;
  });
  return {
    decorations: DecorationSet.create(doc, decorations),
    pendingLanguages: [...pendingLanguages],
  };
}
