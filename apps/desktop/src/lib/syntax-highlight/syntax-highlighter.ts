import type { Theme } from "@pierre/highlights";
import { useSyncExternalStore } from "react";

type HighlightsModule = typeof import("@pierre/highlights");

export type SyntaxThemes = {
  readonly light: Theme;
  readonly dark: Theme;
};

export interface SyntaxHighlighter {
  readonly highlights: HighlightsModule;
  readonly themes: SyntaxThemes;
}

export const SYNTAX_CSS_VARIABLE_PREFIX = "--shiki-";

let loaded: SyntaxHighlighter | null = null;
let loading: Promise<SyntaxHighlighter> | null = null;
const listeners = new Set<() => void>();

export function getSyntaxHighlighter() {
  return loaded;
}

export function loadSyntaxHighlighter() {
  loading ??= Promise.all([
    import("@pierre/highlights"),
    import("@pierre/highlights/themes/github-light-default"),
    import("@pierre/highlights/themes/github-dark-default"),
  ])
    .then(([highlights, light, dark]) => {
      loaded = {
        highlights,
        themes: { light: light.default, dark: dark.default },
      };
      for (const listener of listeners) {
        listener();
      }
      return loaded;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void loadSyntaxHighlighter().catch(() => {});
  return () => {
    listeners.delete(listener);
  };
}

export function useSyntaxHighlighter() {
  return useSyncExternalStore(subscribe, getSyntaxHighlighter, () => null);
}

export function syntaxThemeFor(themes: SyntaxThemes, resolvedTheme: string) {
  return resolvedTheme === "light" ? themes.light : themes.dark;
}
