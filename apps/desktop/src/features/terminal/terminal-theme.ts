import type { ITheme } from "@xterm/xterm";

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function isDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// ANSI 16-color palette designed for dark terminal backgrounds (≈ #0c0c10).
// Colors match a Tokyo Night-inspired palette — vivid enough to stand out on
// near-black but not so saturated they cause eye strain.
const DARK_ANSI: Partial<ITheme> = {
  black: "#1a1b26",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#a9b1d6",
  brightBlack: "#414868",
  brightRed: "#f7768e",
  brightGreen: "#9ece6a",
  brightYellow: "#e0af68",
  brightBlue: "#7aa2f7",
  brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff",
  brightWhite: "#c0caf5",
};

// ANSI 16-color palette designed for light terminal backgrounds (≈ #f7f8fa).
// Every color maintains at least 4.5:1 contrast against the near-white surface
// so ls/grep color output remains readable without theme-switching gymnastics.
const LIGHT_ANSI: Partial<ITheme> = {
  black: "#374151",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#b45309",
  blue: "#2563eb",
  magenta: "#7c3aed",
  cyan: "#0891b2",
  white: "#6b7280",
  brightBlack: "#9ca3af",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#d97706",
  brightBlue: "#3b82f6",
  brightMagenta: "#8b5cf6",
  brightCyan: "#06b6d4",
  // brightWhite maps to the "default text" color in many tools (e.g. bold ls);
  // use a near-black so it stays readable on the light surface.
  brightWhite: "#1f2937",
};

export function buildTerminalTheme(): ITheme {
  const dark = isDark();
  const ansi = dark ? DARK_ANSI : LIGHT_ANSI;

  // xterm's scrollbar is a custom DOM element painted by the renderer, not a
  // native scrollbar, so its colors come from theme options rather than CSS.
  // Mirror the rgba values exported by --scrollbar-thumb / --scrollbar-thumb-hover
  // in theme-tokens.css so the terminal scrollbar tracks the rest of the app.
  const sliderBackground = dark
    ? "rgba(255, 255, 255, 0.08)"
    : "rgba(15, 23, 42, 0.15)";
  const sliderHoverBackground = dark
    ? "rgba(255, 255, 255, 0.14)"
    : "rgba(15, 23, 42, 0.24)";

  return {
    background: readVar("--editor-canvas", dark ? "#0c0c10" : "#f7f8fa"),
    foreground: readVar("--editor-text", dark ? "#d4d4d8" : "#0f172a"),
    cursor: readVar("--editor-text", dark ? "#d4d4d8" : "#0f172a"),
    cursorAccent: readVar("--editor-canvas", dark ? "#0c0c10" : "#f7f8fa"),
    selectionBackground: readVar(
      "--editor-monaco-selection",
      dark ? "#21304d" : "#d9e4f2",
    ),
    scrollbarSliderBackground: sliderBackground,
    scrollbarSliderHoverBackground: sliderHoverBackground,
    scrollbarSliderActiveBackground: sliderHoverBackground,
    // We don't render any overview-ruler decorations, so the default white
    // divider between the content area and the ruler region just looks like
    // a stray vertical hairline next to the scrollbar. Hide it.
    overviewRulerBorder: "transparent",
    ...ansi,
  };
}
