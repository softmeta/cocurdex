import { useColorSchemeName } from "@/preferences";
import generated from "./colors.generated.json";
import { type Surface, useSurface } from "./surface-context";
import syntax from "./syntax-colors.generated.json";

export type ThemeName = keyof typeof generated;
type GeneratedColors = (typeof generated)[ThemeName];
export type ThemeColors = GeneratedColors & { tint: string };

const TINT_SOURCE: Record<ThemeName, keyof GeneratedColors> = {
  light: "primary",
  dark: "sidebarPrimary",
};

function withTint(name: ThemeName): ThemeColors {
  const colors = generated[name];
  return { ...colors, tint: colors[TINT_SOURCE[name]] };
}

export const themeColors: Record<ThemeName, ThemeColors> = {
  light: withTint("light"),
  dark: withTint("dark"),
};

export type SyntaxColors = (typeof syntax)[ThemeName];

export function useThemeName(): ThemeName {
  return useColorSchemeName();
}

export function useThemeColors(): ThemeColors {
  return themeColors[useThemeName()];
}

export function useSyntaxColors(): SyntaxColors {
  return syntax[useThemeName()];
}

export interface GroupedColors {
  page: string;
  cell: string;
}

const GROUPED: Record<Surface, Record<ThemeName, GroupedColors>> = {
  page: {
    light: { page: generated.light.muted, cell: generated.light.card },
    dark: { page: generated.dark.background, cell: generated.dark.card },
  },
  sheet: {
    light: { page: generated.light.muted, cell: generated.light.card },
    dark: { page: generated.dark.popover, cell: generated.dark.muted },
  },
};

export function useGroupedColors(): GroupedColors {
  return GROUPED[useSurface()][useThemeName()];
}
