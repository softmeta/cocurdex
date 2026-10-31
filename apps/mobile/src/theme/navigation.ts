import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { type ThemeName, themeColors } from "./colors";

function navigationTheme(name: ThemeName, base: Theme): Theme {
  const colors = themeColors[name];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.tint,
      background: colors.background,
      card: colors.background,
      text: colors.foreground,
      border: colors.border,
      notification: colors.destructive,
    },
  };
}

export const navigationThemes: Record<ThemeName, Theme> = {
  light: navigationTheme("light", DefaultTheme),
  dark: navigationTheme("dark", DarkTheme),
};
