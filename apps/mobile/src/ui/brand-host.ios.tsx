import { Host } from "@expo/ui/swift-ui";
import { tint } from "@expo/ui/swift-ui/modifiers";
import { useThemeColors } from "@/theme";
import type { BrandHostProps } from "./brand-host-props";

export function BrandHost(props: BrandHostProps) {
  const colors = useThemeColors();
  return <Host {...props} modifiers={[tint(colors.tint)]} />;
}
