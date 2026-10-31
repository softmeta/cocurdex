import {
  getSyntaxHighlighter,
  loadSyntaxHighlighter,
  SYNTAX_CSS_VARIABLE_PREFIX,
} from "@/lib/syntax-highlight";
import { normalizeCodeLanguage } from "./code-languages";

export interface CodeToken {
  from: number;
  to: number;
  style: string;
}

export type CodeTokenizer = (
  code: string,
  language: string,
) => readonly CodeToken[] | null;

const TOKEN_CACHE_LIMIT = 200;
export const CODE_HIGHLIGHT_MAX_LENGTH = 50_000;

const tokenCache = new Map<string, readonly CodeToken[]>();

export function loadCodeLanguage(raw: string): Promise<boolean> {
  const language = normalizeCodeLanguage(raw);
  return loadSyntaxHighlighter()
    .then(({ highlights }) => highlights.isSupportedLanguage(language))
    .catch(() => false);
}

function styleOf(htmlStyle: Record<string, string> | undefined) {
  if (!htmlStyle) return "";
  return Object.entries(htmlStyle)
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

function remember(key: string, tokens: readonly CodeToken[]) {
  tokenCache.delete(key);
  tokenCache.set(key, tokens);
  if (tokenCache.size > TOKEN_CACHE_LIMIT) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
  return tokens;
}

export const tokenizeCode: CodeTokenizer = (code, raw) => {
  const highlighter = getSyntaxHighlighter();
  if (!highlighter) return null;
  const language = normalizeCodeLanguage(raw);
  if (!highlighter.highlights.isSupportedLanguage(language)) return [];
  const key = `${language}\0${code}`;
  const cached = tokenCache.get(key);
  if (cached) return remember(key, cached);
  const lines = highlighter.highlights.codeToTokens(code, {
    lang: language,
    themes: highlighter.themes,
    defaultColor: false,
    cssVariablePrefix: SYNTAX_CSS_VARIABLE_PREFIX,
  }).tokens;
  const tokens = lines.flat().flatMap((token) => {
    const style = styleOf(token.htmlStyle);
    if (!style || token.content.length === 0) return [];
    return [
      { from: token.offset, to: token.offset + token.content.length, style },
    ];
  });
  return remember(key, tokens);
};
