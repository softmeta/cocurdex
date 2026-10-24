import { useColorScheme } from "react-native";
import generated from "./colors.generated.json";
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

function useThemeName(): ThemeName {
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function useThemeColors(): ThemeColors {
  return themeColors[useThemeName()];
}

export function useSyntaxColors(): SyntaxColors {
  return syntax[useThemeName()];
}
