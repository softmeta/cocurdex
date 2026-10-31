import type { ThemeName } from "@/theme";

export type CloseButtonProps = {
  accessibilityLabel: string;
  onPress(): void;
  scheme?: ThemeName;
};
