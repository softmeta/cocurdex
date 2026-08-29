/**
 * Named UI color presets. Each preset defines independent light and dark
 * token maps for the shadcn core variables in theme-preset.css.
 *
 * "cocurdex" is the product default: it clears inline overrides so the CSS in
 * theme-preset.css + theme-tokens.css remains the single source of truth
 * (including the dark sidebar sink and chat-canvas ramps).
 *
 * Other packs follow popular editor/product palettes (same names Codex ships)
 * mapped onto our token set — aesthetic approximations, not full ports.
 */

export const themePresetIds = [
  "cocurdex",
  "absolutely",
  "catppuccin",
  "everforest",
  "github",
  "gruvbox",
  "linear",
  "notion",
  "one",
  "proof",
  "raycast",
  "rose-pine",
  "solarized",
  "vercel",
  "vscode-plus",
  "xcode",
] as const;

export type ThemePresetId = (typeof themePresetIds)[number];

export const DEFAULT_THEME_PRESET_ID: ThemePresetId = "cocurdex";

/** Core shadcn tokens each non-default preset must supply for light and dark. */
export const themeTokenKeys = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

export type ThemeTokenKey = (typeof themeTokenKeys)[number];

export type ThemeTokenMap = Record<ThemeTokenKey, string>;

export type ResolvedTheme = "light" | "dark";

export interface ThemePresetMeta {
  id: ThemePresetId;
  /** Proper-noun label shown in the picker (not translated). */
  label: string;
  /** Accent swatches for light / dark so the dropdown previews both modes. */
  swatch: Record<ResolvedTheme, string>;
}

type ThemePresetDefinition = ThemePresetMeta & {
  /** Absent for cocurdex — CSS owns the tokens. */
  tokens?: Record<ResolvedTheme, ThemeTokenMap>;
};

/** Compact seed for building a full shadcn token map. */
interface PaletteSeed {
  background: string;
  foreground: string;
  /** Raised surface (cards / popovers). Defaults to background. */
  card?: string;
  primary: string;
  /** Text on primary; defaults to background. */
  primaryForeground?: string;
  /** Soft fill (secondary / muted / accent hover). */
  muted?: string;
  mutedForeground: string;
  destructive: string;
  /**
   * Solid border for light themes. Dark themes default to a translucent
   * foreground mix when omitted.
   */
  border?: string;
  /** Sunk nav plane; defaults to card. */
  sidebar?: string;
  charts?: [string, string, string, string, string];
  /** When true, borders use translucent foreground (typical dark UI). */
  translucentBorders?: boolean;
}

function pack(seed: PaletteSeed): ThemeTokenMap {
  const card = seed.card ?? seed.background;
  const muted = seed.muted ?? card;
  const primaryFg = seed.primaryForeground ?? seed.background;
  const sidebar = seed.sidebar ?? card;
  const chart: [string, string, string, string, string] = seed.charts ?? [
    seed.primary,
    seed.primary,
    seed.primary,
    seed.primary,
    seed.destructive,
  ];

  const border = seed.translucentBorders
    ? `color-mix(in srgb, ${seed.foreground} 12%, transparent)`
    : (seed.border ?? muted);
  const input = seed.translucentBorders
    ? `color-mix(in srgb, ${seed.foreground} 16%, transparent)`
    : (seed.border ?? muted);

  return {
    background: seed.background,
    foreground: seed.foreground,
    card,
    "card-foreground": seed.foreground,
    popover: card,
    "popover-foreground": seed.foreground,
    primary: seed.primary,
    "primary-foreground": primaryFg,
    secondary: muted,
    "secondary-foreground": seed.foreground,
    muted,
    "muted-foreground": seed.mutedForeground,
    accent: muted,
    "accent-foreground": seed.foreground,
    destructive: seed.destructive,
    border,
    input,
    ring: seed.primary,
    "chart-1": chart[0],
    "chart-2": chart[1],
    "chart-3": chart[2],
    "chart-4": chart[3],
    "chart-5": chart[4],
    sidebar,
    "sidebar-foreground": seed.foreground,
    "sidebar-primary": seed.primary,
    "sidebar-primary-foreground": primaryFg,
    "sidebar-accent": muted,
    "sidebar-accent-foreground": seed.foreground,
    "sidebar-border": border,
    "sidebar-ring": seed.primary,
  };
}

// --- Community / product palettes (light + dark) ---

// Catppuccin Latte / Mocha — https://catppuccin.com/palette/
const catppuccin = {
  light: pack({
    background: "#eff1f5",
    foreground: "#4c4f69",
    card: "#e6e9ef",
    primary: "#1e66f5",
    primaryForeground: "#eff1f5",
    muted: "#ccd0da",
    mutedForeground: "#6c6f85",
    destructive: "#d20f39",
    border: "#ccd0da",
    sidebar: "#e6e9ef",
    charts: ["#1e66f5", "#40a02b", "#df8e1d", "#8839ef", "#e64553"],
  }),
  dark: pack({
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    card: "#181825",
    primary: "#89b4fa",
    primaryForeground: "#1e1e2e",
    muted: "#313244",
    mutedForeground: "#a6adc8",
    destructive: "#f38ba8",
    sidebar: "#11111b",
    translucentBorders: true,
    charts: ["#89b4fa", "#a6e3a1", "#f9e2af", "#cba6f7", "#f38ba8"],
  }),
} as const;

// GitHub / Primer.
const github = {
  light: pack({
    background: "#ffffff",
    foreground: "#1f2328",
    card: "#ffffff",
    primary: "#0969da",
    primaryForeground: "#ffffff",
    muted: "#f6f8fa",
    mutedForeground: "#656d76",
    destructive: "#cf222e",
    border: "#d0d7de",
    sidebar: "#f6f8fa",
    charts: ["#0969da", "#1a7f37", "#9a6700", "#8250df", "#cf222e"],
  }),
  dark: pack({
    background: "#0d1117",
    foreground: "#e6edf3",
    card: "#161b22",
    primary: "#2f81f7",
    primaryForeground: "#ffffff",
    muted: "#21262d",
    mutedForeground: "#8b949e",
    destructive: "#f85149",
    sidebar: "#010409",
    translucentBorders: true,
    charts: ["#2f81f7", "#3fb950", "#d29922", "#a371f7", "#f85149"],
  }),
} as const;

// Gruvbox medium (morhetz).
const gruvbox = {
  light: pack({
    background: "#fbf1c7",
    foreground: "#3c3836",
    card: "#f2e5bc",
    primary: "#076678",
    primaryForeground: "#fbf1c7",
    muted: "#ebdbb2",
    mutedForeground: "#7c6f64",
    destructive: "#9d0006",
    border: "#d5c4a1",
    sidebar: "#f2e5bc",
    charts: ["#076678", "#79740e", "#b57614", "#8f3f71", "#9d0006"],
  }),
  dark: pack({
    background: "#282828",
    foreground: "#ebdbb2",
    card: "#3c3836",
    primary: "#83a598",
    primaryForeground: "#1d2021",
    muted: "#504945",
    mutedForeground: "#a89984",
    destructive: "#fb4934",
    sidebar: "#1d2021",
    translucentBorders: true,
    charts: ["#83a598", "#b8bb26", "#fabd2f", "#d3869b", "#fb4934"],
  }),
} as const;

// Everforest medium (sainnhe).
const everforest = {
  light: pack({
    background: "#fdf6e3",
    foreground: "#5c6a72",
    card: "#f4f0d9",
    primary: "#3a94c5",
    primaryForeground: "#fdf6e3",
    muted: "#efebd4",
    mutedForeground: "#829181",
    destructive: "#f85552",
    border: "#e6e2cc",
    sidebar: "#f4f0d9",
    charts: ["#3a94c5", "#8da101", "#dfa000", "#df69ba", "#f85552"],
  }),
  dark: pack({
    background: "#2d353b",
    foreground: "#d3c6aa",
    card: "#343f44",
    primary: "#7fbbb3",
    primaryForeground: "#2d353b",
    muted: "#3d484d",
    mutedForeground: "#859289",
    destructive: "#e67e80",
    sidebar: "#232a2e",
    translucentBorders: true,
    charts: ["#7fbbb3", "#a7c080", "#dbbc7f", "#d699b6", "#e67e80"],
  }),
} as const;

// Atom One Light / One Dark.
const one = {
  light: pack({
    background: "#fafafa",
    foreground: "#383a42",
    card: "#f0f0f0",
    primary: "#4078f2",
    primaryForeground: "#fafafa",
    muted: "#e5e5e6",
    mutedForeground: "#696c77",
    destructive: "#e45649",
    border: "#d0d0d1",
    sidebar: "#f0f0f0",
    charts: ["#4078f2", "#50a14f", "#c18401", "#a626a4", "#e45649"],
  }),
  dark: pack({
    background: "#282c34",
    foreground: "#abb2bf",
    card: "#21252b",
    primary: "#61afef",
    primaryForeground: "#282c34",
    muted: "#3e4451",
    mutedForeground: "#5c6370",
    destructive: "#e06c75",
    sidebar: "#21252b",
    translucentBorders: true,
    charts: ["#61afef", "#98c379", "#e5c07b", "#c678dd", "#e06c75"],
  }),
} as const;

// Rosé Pine Dawn / Main — https://rosepinetheme.com/
const rosePine = {
  light: pack({
    background: "#faf4ed",
    foreground: "#575279",
    card: "#fffaf3",
    primary: "#907aa9",
    primaryForeground: "#faf4ed",
    muted: "#f2e9e1",
    mutedForeground: "#797593",
    destructive: "#b4637a",
    border: "#dfdad9",
    sidebar: "#f2e9e1",
    charts: ["#907aa9", "#56949f", "#ea9d34", "#d7827e", "#b4637a"],
  }),
  dark: pack({
    background: "#191724",
    foreground: "#e0def4",
    card: "#1f1d2e",
    primary: "#c4a7e7",
    primaryForeground: "#191724",
    muted: "#26233a",
    mutedForeground: "#908caa",
    destructive: "#eb6f92",
    sidebar: "#1f1d2e",
    translucentBorders: true,
    charts: ["#c4a7e7", "#9ccfd8", "#f6c177", "#ebbcba", "#eb6f92"],
  }),
} as const;

// Solarized (Ethan Schoonover).
const solarized = {
  light: pack({
    background: "#fdf6e3",
    foreground: "#657b83",
    card: "#eee8d5",
    primary: "#268bd2",
    primaryForeground: "#fdf6e3",
    muted: "#eee8d5",
    mutedForeground: "#93a1a1",
    destructive: "#dc322f",
    border: "#eee8d5",
    sidebar: "#eee8d5",
    charts: ["#268bd2", "#859900", "#b58900", "#6c71c4", "#dc322f"],
  }),
  dark: pack({
    background: "#002b36",
    foreground: "#839496",
    card: "#073642",
    primary: "#268bd2",
    primaryForeground: "#fdf6e3",
    muted: "#073642",
    mutedForeground: "#586e75",
    destructive: "#dc322f",
    sidebar: "#00212b",
    translucentBorders: true,
    charts: ["#268bd2", "#859900", "#b58900", "#6c71c4", "#dc322f"],
  }),
} as const;

// Linear product-inspired (indigo brand).
const linear = {
  light: pack({
    background: "#ffffff",
    foreground: "#1a1a1a",
    card: "#f7f8f8",
    primary: "#5e6ad2",
    primaryForeground: "#ffffff",
    muted: "#f3f4f5",
    mutedForeground: "#6b6f76",
    destructive: "#eb5757",
    border: "#e4e5e7",
    sidebar: "#f7f8f8",
    charts: ["#5e6ad2", "#4cb782", "#f2c94c", "#bb6bd9", "#eb5757"],
  }),
  dark: pack({
    background: "#0f1011",
    foreground: "#e6e6e6",
    card: "#191a1b",
    primary: "#5e6ad2",
    primaryForeground: "#ffffff",
    muted: "#232426",
    mutedForeground: "#8a8f98",
    destructive: "#eb5757",
    sidebar: "#0c0d0e",
    translucentBorders: true,
    charts: ["#5e6ad2", "#4cb782", "#f2c94c", "#bb6bd9", "#eb5757"],
  }),
} as const;

// Notion product-inspired (warm gray + blue).
const notion = {
  light: pack({
    background: "#ffffff",
    foreground: "#37352f",
    card: "#ffffff",
    primary: "#2383e2",
    primaryForeground: "#ffffff",
    muted: "#f7f6f3",
    mutedForeground: "#787774",
    destructive: "#eb5757",
    border: "#e9e9e7",
    sidebar: "#f7f6f3",
    charts: ["#2383e2", "#0f7b6c", "#dfab01", "#6940a5", "#eb5757"],
  }),
  dark: pack({
    background: "#191919",
    foreground: "#ffffffcf",
    card: "#202020",
    primary: "#529cca",
    primaryForeground: "#191919",
    muted: "#2c2c2c",
    mutedForeground: "#9b9b9b",
    destructive: "#ff7369",
    sidebar: "#141414",
    translucentBorders: true,
    charts: ["#529cca", "#4dab9a", "#ffdc49", "#9a6dd7", "#ff7369"],
  }),
} as const;

// Raycast product-inspired (red brand on dark-first UI).
const raycast = {
  light: pack({
    background: "#ffffff",
    foreground: "#1a1a1a",
    card: "#f5f5f5",
    primary: "#ff6363",
    primaryForeground: "#ffffff",
    muted: "#f0f0f0",
    mutedForeground: "#6e6e6e",
    destructive: "#ff6363",
    border: "#e5e5e5",
    sidebar: "#f5f5f5",
    charts: ["#ff6363", "#56c2ff", "#ffc531", "#b988ff", "#ff6363"],
  }),
  dark: pack({
    background: "#0d0d0d",
    foreground: "#f2f2f2",
    card: "#161616",
    primary: "#ff6363",
    primaryForeground: "#ffffff",
    muted: "#222222",
    mutedForeground: "#8c8c8c",
    destructive: "#ff6363",
    sidebar: "#0a0a0a",
    translucentBorders: true,
    charts: ["#ff6363", "#56c2ff", "#ffc531", "#b988ff", "#ff6363"],
  }),
} as const;

// Vercel product-inspired (black / white, blue accent).
const vercel = {
  light: pack({
    background: "#ffffff",
    foreground: "#000000",
    card: "#fafafa",
    primary: "#0070f3",
    primaryForeground: "#ffffff",
    muted: "#f2f2f2",
    mutedForeground: "#666666",
    destructive: "#e00",
    border: "#eaeaea",
    sidebar: "#fafafa",
    charts: ["#0070f3", "#0070f3", "#f5a623", "#7928ca", "#e00"],
  }),
  dark: pack({
    background: "#000000",
    foreground: "#ededed",
    card: "#0a0a0a",
    primary: "#0070f3",
    primaryForeground: "#ffffff",
    muted: "#111111",
    mutedForeground: "#888888",
    destructive: "#ff1a1a",
    sidebar: "#000000",
    translucentBorders: true,
    charts: ["#0070f3", "#50e3c2", "#f5a623", "#7928ca", "#ff1a1a"],
  }),
} as const;

// VS Code default-ish (Light+ / Dark+).
const vscodePlus = {
  light: pack({
    background: "#ffffff",
    foreground: "#333333",
    card: "#f3f3f3",
    primary: "#0078d4",
    primaryForeground: "#ffffff",
    muted: "#e8e8e8",
    mutedForeground: "#6c6c6c",
    destructive: "#a1260d",
    border: "#cecece",
    sidebar: "#f3f3f3",
    charts: ["#0078d4", "#388a34", "#bf8803", "#652d90", "#a1260d"],
  }),
  dark: pack({
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    card: "#252526",
    primary: "#0078d4",
    primaryForeground: "#ffffff",
    muted: "#2d2d2d",
    mutedForeground: "#9d9d9d",
    destructive: "#f48771",
    sidebar: "#252526",
    translucentBorders: true,
    charts: ["#3794ff", "#89d185", "#cca700", "#c586c0", "#f48771"],
  }),
} as const;

// Xcode light / dark system-adjacent blues.
const xcode = {
  light: pack({
    background: "#ffffff",
    foreground: "#1d1d1f",
    card: "#f5f5f7",
    primary: "#007aff",
    primaryForeground: "#ffffff",
    muted: "#e8e8ed",
    mutedForeground: "#6e6e73",
    destructive: "#ff3b30",
    border: "#d2d2d7",
    sidebar: "#f5f5f7",
    charts: ["#007aff", "#34c759", "#ff9500", "#af52de", "#ff3b30"],
  }),
  dark: pack({
    background: "#1e1e1e",
    foreground: "#ffffff",
    card: "#2c2c2e",
    primary: "#0a84ff",
    primaryForeground: "#ffffff",
    muted: "#3a3a3c",
    mutedForeground: "#98989d",
    destructive: "#ff453a",
    sidebar: "#1c1c1e",
    translucentBorders: true,
    charts: ["#0a84ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff453a"],
  }),
} as const;

// "Absolutely" — warm amber accent, clean neutral shells (Codex built-in vibe).
const absolutely = {
  light: pack({
    background: "#fbfaf8",
    foreground: "#1c1917",
    card: "#f5f2ed",
    primary: "#c2410c",
    primaryForeground: "#fff7ed",
    muted: "#efeae3",
    mutedForeground: "#78716c",
    destructive: "#b91c1c",
    border: "#e7e0d6",
    sidebar: "#f5f2ed",
    charts: ["#c2410c", "#15803d", "#ca8a04", "#7c3aed", "#b91c1c"],
  }),
  dark: pack({
    background: "#171412",
    foreground: "#f5f0e8",
    card: "#1f1b18",
    primary: "#fb923c",
    primaryForeground: "#1c1917",
    muted: "#2a241f",
    mutedForeground: "#a8a29e",
    destructive: "#f87171",
    sidebar: "#120f0d",
    translucentBorders: true,
    charts: ["#fb923c", "#4ade80", "#facc15", "#a78bfa", "#f87171"],
  }),
} as const;

// "Proof" — mint / editorial green accent (Codex built-in vibe).
const proof = {
  light: pack({
    background: "#f8faf9",
    foreground: "#14201c",
    card: "#eef5f1",
    primary: "#0f766e",
    primaryForeground: "#f0fdfa",
    muted: "#e6f0eb",
    mutedForeground: "#5f736b",
    destructive: "#b91c1c",
    border: "#d5e3db",
    sidebar: "#eef5f1",
    charts: ["#0f766e", "#15803d", "#ca8a04", "#7c3aed", "#b91c1c"],
  }),
  dark: pack({
    background: "#0e1513",
    foreground: "#e7f0ec",
    card: "#15201c",
    primary: "#2dd4bf",
    primaryForeground: "#042f2e",
    muted: "#1c2a25",
    mutedForeground: "#8aa399",
    destructive: "#f87171",
    sidebar: "#0a100e",
    translucentBorders: true,
    charts: ["#2dd4bf", "#4ade80", "#facc15", "#a78bfa", "#f87171"],
  }),
} as const;

/**
 * Cocurdex brand teal used only for picker swatches. Actual colors live in CSS.
 * Mirrors theme-preset.css --primary (light / dark oklch).
 */
const cocurdexSwatch = {
  light: "oklch(0.511 0.096 186.391)",
  dark: "oklch(0.437 0.078 188.216)",
} as const;

const themePresetDefinitions: ThemePresetDefinition[] = [
  {
    id: "cocurdex",
    label: "cocurdex",
    swatch: cocurdexSwatch,
  },
  {
    id: "absolutely",
    label: "Absolutely",
    swatch: { light: "#c2410c", dark: "#fb923c" },
    tokens: absolutely,
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    swatch: { light: "#1e66f5", dark: "#89b4fa" },
    tokens: catppuccin,
  },
  {
    id: "everforest",
    label: "Everforest",
    swatch: { light: "#3a94c5", dark: "#7fbbb3" },
    tokens: everforest,
  },
  {
    id: "github",
    label: "GitHub",
    swatch: { light: "#0969da", dark: "#2f81f7" },
    tokens: github,
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    swatch: { light: "#076678", dark: "#83a598" },
    tokens: gruvbox,
  },
  {
    id: "linear",
    label: "Linear",
    swatch: { light: "#5e6ad2", dark: "#5e6ad2" },
    tokens: linear,
  },
  {
    id: "notion",
    label: "Notion",
    swatch: { light: "#2383e2", dark: "#529cca" },
    tokens: notion,
  },
  {
    id: "one",
    label: "One",
    swatch: { light: "#4078f2", dark: "#61afef" },
    tokens: one,
  },
  {
    id: "proof",
    label: "Proof",
    swatch: { light: "#0f766e", dark: "#2dd4bf" },
    tokens: proof,
  },
  {
    id: "raycast",
    label: "Raycast",
    swatch: { light: "#ff6363", dark: "#ff6363" },
    tokens: raycast,
  },
  {
    id: "rose-pine",
    label: "Rose Pine",
    swatch: { light: "#907aa9", dark: "#c4a7e7" },
    tokens: rosePine,
  },
  {
    id: "solarized",
    label: "Solarized",
    swatch: { light: "#268bd2", dark: "#268bd2" },
    tokens: solarized,
  },
  {
    id: "vercel",
    label: "Vercel",
    swatch: { light: "#0070f3", dark: "#0070f3" },
    tokens: vercel,
  },
  {
    id: "vscode-plus",
    label: "VS Code Plus",
    swatch: { light: "#0078d4", dark: "#3794ff" },
    tokens: vscodePlus,
  },
  {
    id: "xcode",
    label: "Xcode",
    swatch: { light: "#007aff", dark: "#0a84ff" },
    tokens: xcode,
  },
];

const themePresetById = new Map(
  themePresetDefinitions.map((preset) => [preset.id, preset]),
);

export function isThemePresetId(value: string | null): value is ThemePresetId {
  return (
    value !== null && (themePresetIds as readonly string[]).includes(value)
  );
}

function requireThemePreset(id: ThemePresetId): ThemePresetDefinition {
  const preset = themePresetById.get(id);
  if (preset) {
    return preset;
  }
  const fallback = themePresetById.get(DEFAULT_THEME_PRESET_ID);
  if (!fallback) {
    throw new Error("Default theme preset 'cocurdex' is not registered");
  }
  return fallback;
}

export function getThemePresetMeta(id: ThemePresetId): ThemePresetMeta {
  const preset = requireThemePreset(id);
  return {
    id: preset.id,
    label: preset.label,
    swatch: preset.swatch,
  };
}

export function listThemePresets(): ThemePresetMeta[] {
  return themePresetDefinitions.map((preset) => ({
    id: preset.id,
    label: preset.label,
    swatch: preset.swatch,
  }));
}

/**
 * Apply the active preset for the resolved light/dark appearance.
 * Call whenever the preset changes or the resolved theme flips.
 */
export function applyThemePreset(
  presetId: ThemePresetId,
  resolvedTheme: ResolvedTheme,
) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const preset = requireThemePreset(presetId);

  root.dataset.themePreset = preset.id;

  // Default product theme: drop inline overrides so CSS cascade owns tokens
  // (including theme-tokens.css dark surface ramps).
  if (preset.id === "cocurdex" || !preset.tokens) {
    for (const key of themeTokenKeys) {
      root.style.removeProperty(`--${key}`);
    }
    return;
  }

  const map = preset.tokens[resolvedTheme];
  for (const key of themeTokenKeys) {
    root.style.setProperty(`--${key}`, map[key]);
  }
}
