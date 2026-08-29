import type { Monaco } from "@monaco-editor/react";
import { clampRgb, formatHex8, parse } from "culori";
import type { HighlighterGeneric } from "shiki";

// Shiki theme ids that supply the token color palette. Editor chrome (background,
// gutter, selection, line numbers) is overridden from the app CSS variables in
// `applyEditorTheme`, so these only need to provide pleasant token colors.
export const EDITOR_SHIKI_THEMES = {
  dark: "github-dark-default",
  light: "github-light-default",
} as const;

export type EditorThemeId =
  (typeof EDITOR_SHIKI_THEMES)[keyof typeof EDITOR_SHIKI_THEMES];

export function getEditorThemeName(resolvedTheme: string): EditorThemeId {
  return resolvedTheme === "light"
    ? EDITOR_SHIKI_THEMES.light
    : EDITOR_SHIKI_THEMES.dark;
}

const fallbackEditorColors = {
  dark: {
    background: "#0b0b0b",
    foreground: "#fafafa",
    lineHighlight: "#26262675",
    selection: "#0062593d",
    inactiveSelection: "#4444448a",
    gutter: "#0b0b0b",
    lineNumber: "#a1a1a1",
    whitespace: "#a1a1a152",
    indent: "#ffffff1a",
    indentActive: "#00625975",
  },
  light: {
    background: "#ffffff",
    foreground: "#252525",
    lineHighlight: "#f5f5f575",
    selection: "#009f943d",
    inactiveSelection: "#f7f7f78a",
    gutter: "#ffffff",
    lineNumber: "#737373",
    whitespace: "#73737352",
    indent: "#ebebeb94",
    indentActive: "#009f9475",
  },
} as const;

function resolveCssColor(name: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function getEditorThemeColor(name: string, fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const color = parse(resolveCssColor(name));
  return color ? formatHex8(clampRgb(color)) : fallback;
}

// Editor chrome colors sourced from the app appearance CSS variables so the
// editor surface matches the surrounding UI regardless of the Shiki token theme.
function buildEditorChromeColors(isDark: boolean): Record<string, string> {
  const fallback = isDark
    ? fallbackEditorColors.dark
    : fallbackEditorColors.light;

  return {
    "editor.background": getEditorThemeColor(
      "--editor-monaco-bg",
      fallback.background,
    ),
    "editor.foreground": getEditorThemeColor(
      "--editor-text",
      fallback.foreground,
    ),
    "editor.lineHighlightBackground": getEditorThemeColor(
      "--editor-monaco-line-highlight",
      fallback.lineHighlight,
    ),
    "editor.selectionBackground": getEditorThemeColor(
      "--editor-monaco-selection",
      fallback.selection,
    ),
    "editor.inactiveSelectionBackground": getEditorThemeColor(
      "--editor-monaco-selection-inactive",
      fallback.inactiveSelection,
    ),
    "editorGutter.background": getEditorThemeColor(
      "--editor-monaco-gutter",
      fallback.gutter,
    ),
    "editorLineNumber.foreground": getEditorThemeColor(
      "--editor-monaco-line-number",
      fallback.lineNumber,
    ),
    "editorLineNumber.activeForeground": getEditorThemeColor(
      "--editor-monaco-line-number-active",
      fallback.foreground,
    ),
    "editorWhitespace.foreground": getEditorThemeColor(
      "--editor-monaco-whitespace",
      fallback.whitespace,
    ),
    "editorIndentGuide.background1": getEditorThemeColor(
      "--editor-monaco-indent",
      fallback.indent,
    ),
    "editorIndentGuide.activeBackground1": getEditorThemeColor(
      "--editor-monaco-indent-active",
      fallback.indentActive,
    ),
  };
}

// Injected by `monaco-loader` after its dynamic `import("@shikijs/monaco")` so
// this module never statically pulls that package into the main chunk.
type TextmateThemeToMonacoTheme =
  typeof import("@shikijs/monaco").textmateThemeToMonacoTheme;

let textmateThemeToMonacoTheme: TextmateThemeToMonacoTheme | null = null;

export function setTextmateThemeToMonacoTheme(fn: TextmateThemeToMonacoTheme) {
  textmateThemeToMonacoTheme = fn;
}

// Re-defines a Shiki-registered Monaco theme, keeping its token rules but
// overlaying app-matched chrome colors. Must be called after `shikiToMonaco`
// has registered the theme so `highlighter.getTheme` resolves it.
export function applyEditorTheme(
  monaco: Monaco,
  // biome-ignore lint/suspicious/noExplicitAny: Shiki's generic highlighter type
  highlighter: HighlighterGeneric<any, any>,
  themeId: EditorThemeId,
) {
  if (!textmateThemeToMonacoTheme) {
    throw new Error(
      "Monaco theme helpers are not ready; call ensureMonacoLoaderConfigured first",
    );
  }

  const isDark = themeId === EDITOR_SHIKI_THEMES.dark;
  // `@shikijs/monaco`'s `MonacoTheme` extends `monaco-editor-core`'s
  // `IStandaloneThemeData`, which we don't install — its `colors` field is
  // unresolved here. Re-type against the installed monaco-editor so the spread
  // and `colors` overlay typecheck.
  const baseTheme = textmateThemeToMonacoTheme(
    highlighter.getTheme(themeId),
  ) as Parameters<Monaco["editor"]["defineTheme"]>[1];

  monaco.editor.defineTheme(themeId, {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...buildEditorChromeColors(isDark),
    },
  });
}
