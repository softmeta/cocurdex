import type { ThemedToken } from "@pierre/highlights";
import { type CSSProperties, useMemo } from "react";
import { useResolvedTheme } from "@/lib";
import { syntaxThemeFor, useSyntaxHighlighter } from "@/lib/syntax-highlight";

const MAX_HIGHLIGHT_LENGTH = 50_000;

const ITALIC = 1;
const BOLD = 2;

export function shellTokenStyle(token: ThemedToken): CSSProperties {
  const fontStyle = token.fontStyle ?? 0;
  return {
    color: token.color,
    fontStyle: fontStyle & ITALIC ? "italic" : undefined,
    fontWeight: fontStyle & BOLD ? 700 : undefined,
  };
}

export function useShellTokenLines(code: string) {
  const resolvedTheme = useResolvedTheme();
  const highlighter = useSyntaxHighlighter();

  return useMemo(() => {
    if (
      !highlighter ||
      code.length === 0 ||
      code.length > MAX_HIGHLIGHT_LENGTH
    ) {
      return null;
    }
    try {
      return highlighter.highlights.codeToTokens(code, {
        lang: "bash",
        theme: syntaxThemeFor(highlighter.themes, resolvedTheme),
      }).tokens;
    } catch {
      return null;
    }
  }, [code, highlighter, resolvedTheme]);
}
