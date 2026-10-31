import {
  MERMAID_THEME_VARIABLES,
  type MermaidAppearance,
} from "@cocurdex/shared";
import { themeColors } from "@/theme";
import type { DiagramPalette } from "./native-mermaid";

export function diagramPalette(appearance: MermaidAppearance): DiagramPalette {
  const theme = MERMAID_THEME_VARIABLES[appearance];
  return {
    background: themeColors[appearance].background,
    foreground: theme.textColor,
    text: theme.primaryTextColor,
    line: theme.lineColor,
    nodeFill: theme.primaryColor,
    nodeStroke: theme.primaryBorderColor,
    groupFill: theme.clusterBkg,
    groupHeader: theme.clusterBorder,
  };
}
