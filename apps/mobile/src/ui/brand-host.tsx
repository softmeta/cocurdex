import { Host } from "@expo/ui";
import { useThemeColors, useThemeName } from "@/theme";
import type { BrandHostProps } from "./brand-host-props";

export function BrandHost(props: BrandHostProps) {
  const colors = useThemeColors();
  const themeName = useThemeName();
  return (
    <Host
      {...props}
      colorScheme={props.colorScheme ?? themeName}
      seedColor={colors.primary}
    />
  );
}
