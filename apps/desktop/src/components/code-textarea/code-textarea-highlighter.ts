import type { BundledLanguage, Highlighter, ThemedToken } from "shiki";

// Worktree setup and cleanup scripts are shell, so that is the only grammar
// these fields need today.
const CODE_LANGUAGE: BundledLanguage = "shellscript";

// The same Shiki themes the file editor uses (see features/editor/monaco), so a
// script reads like a shell file opened in the editor. Duplicated rather than
// imported from that feature: components must not depend on feature modules.
const CODE_THEMES = {
  dark: "github-dark-default",
  light: "github-light-default",
} as const;

export type CodeThemeId = (typeof CODE_THEMES)[keyof typeof CODE_THEMES];

export function getCodeThemeId(resolvedTheme: string): CodeThemeId {
  return resolvedTheme === "light" ? CODE_THEMES.light : CODE_THEMES.dark;
}

let highlighterPromise: Promise<Highlighter> | null = null;

// Shiki (engine + grammar) dominates the bundle, so it is imported on demand
// and the instance is shared by every CodeTextarea.
export function loadCodeHighlighter() {
  highlighterPromise ??= import("shiki")
    .then(({ createHighlighter }) =>
      createHighlighter({
        themes: [CODE_THEMES.dark, CODE_THEMES.light],
        langs: [CODE_LANGUAGE],
      }),
    )
    .catch((error) => {
      // Allow a later retry instead of caching the failure.
      highlighterPromise = null;
      throw error;
    });
  return highlighterPromise;
}

export function codeToTokenLines(
  highlighter: Highlighter,
  code: string,
  themeId: CodeThemeId,
): ThemedToken[][] {
  return highlighter.codeToTokens(code, {
    lang: CODE_LANGUAGE,
    theme: themeId,
  }).tokens;
}
