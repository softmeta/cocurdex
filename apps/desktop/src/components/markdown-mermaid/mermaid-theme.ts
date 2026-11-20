import {
  MERMAID_THEME_CSS,
  MERMAID_THEME_VARIABLES,
  type MermaidAppearance,
} from "@cocurdex/client-runtime";
import type { MermaidConfig } from "mermaid";

export type { MermaidAppearance };

const CJK_FONT_FAMILIES = [
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans CJK SC"',
];
const GENERIC_FONT_FAMILIES = new Set(["sans-serif", "serif", "system-ui"]);

export interface MermaidTypography {
  fontFamily: string;
  lineHeight: string;
}

export function withCjkFontFamilies(fontFamily: string): string {
  const families = fontFamily.split(",").map((family) => family.trim());
  const last = families.at(-1) ?? "";
  const generic = GENERIC_FONT_FAMILIES.has(last) ? [last] : [];
  const named = generic.length > 0 ? families.slice(0, -1) : families;
  return [...named, ...CJK_FONT_FAMILIES, ...generic].join(", ");
}

export function mermaidThemeConfig(
  appearance: MermaidAppearance,
  typography: MermaidTypography,
): MermaidConfig {
  const fontFamily = withCjkFontFamilies(typography.fontFamily);
  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    fontFamily,
    theme: "base",
    themeCSS: `${MERMAID_THEME_CSS}\nforeignObject div { line-height: ${typography.lineHeight}; }`,
    themeVariables: { ...MERMAID_THEME_VARIABLES[appearance], fontFamily },
  };
}
