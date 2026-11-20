import {
  MERMAID_THEME_CSS,
  MERMAID_THEME_VARIABLES,
  type MermaidAppearance,
} from "@cocurdex/client-runtime";
import type { MermaidConfig } from "mermaid";

export type { MermaidAppearance };

export function mermaidThemeConfig(
  appearance: MermaidAppearance,
  fontFamily: string,
): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    fontFamily,
    theme: "base",
    themeCSS: MERMAID_THEME_CSS,
    themeVariables: { ...MERMAID_THEME_VARIABLES[appearance], fontFamily },
  };
}
