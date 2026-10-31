import {
  MERMAID_THEME_CSS,
  MERMAID_THEME_VARIABLES,
  type MermaidAppearance,
} from "@cocurdex/shared";
import type { MermaidConfig } from "@streamdown/mermaid";

export type { MermaidAppearance };

export function mermaidThemeConfig(
  appearance: MermaidAppearance,
  fontFamily: string,
): MermaidConfig {
  return {
    fontFamily,
    theme: "base",
    themeCSS: MERMAID_THEME_CSS,
    themeVariables: { ...MERMAID_THEME_VARIABLES[appearance], fontFamily },
  };
}
