import type { CodeHighlighterPlugin } from "streamdown";
import {
  loadSyntaxHighlighter,
  SYNTAX_CSS_VARIABLE_PREFIX,
  type SyntaxHighlighter,
} from "@/lib/syntax-highlight";

type HighlightResult = ReturnType<CodeHighlighterPlugin["highlight"]>;

export function createMarkdownCodeHighlighter({
  highlights,
  themes,
}: SyntaxHighlighter): CodeHighlighterPlugin {
  return {
    name: "shiki",
    type: "code-highlighter",
    getSupportedLanguages: () => [],
    getThemes: () => ["github-light-default", "github-dark-default"],
    supportsLanguage: (language) => highlights.isSupportedLanguage(language),
    highlight({ code, language }) {
      const lang = highlights.isSupportedLanguage(language) ? language : "text";
      return highlights.codeToTokens(code, {
        lang,
        themes,
        cssVariablePrefix: SYNTAX_CSS_VARIABLE_PREFIX,
      }) as HighlightResult;
    },
  };
}

export function loadMarkdownCodeHighlighter() {
  return loadSyntaxHighlighter().then(createMarkdownCodeHighlighter);
}
