import {
  MERMAID_THEME_CSS,
  MERMAID_THEME_VARIABLES,
  type MermaidAppearance,
} from "@cocurdex/shared";

export function allowsMermaidNavigation(url: string) {
  return url === "about:blank";
}

export type MermaidRequest = {
  id: string;
  source: string;
  appearance: MermaidAppearance;
};

export type MermaidMessage =
  | { type: "ready" }
  | {
      type: "rendered";
      id: string;
      svg: string;
      width: number;
      height: number;
      png: string | null;
    }
  | { type: "error"; id: string };

const FONT_FAMILY = "-apple-system, Roboto, 'Segoe UI', sans-serif";

function scriptValue(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function mermaidConfig(appearance: MermaidAppearance) {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    fontFamily: FONT_FAMILY,
    themeCSS: MERMAID_THEME_CSS,
    themeVariables: {
      ...MERMAID_THEME_VARIABLES[appearance],
      fontFamily: FONT_FAMILY,
    },
  };
}

export function mermaidRenderScript({
  id,
  source,
  appearance,
}: MermaidRequest) {
  const request = { id, source, config: mermaidConfig(appearance) };
  return `window.cocurdexMermaid.render(${scriptValue(request)});true;`;
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

const VIEWER_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function mermaidViewerDocument(svg: string, background: string) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${VIEWER_POLICY}">
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=4,user-scalable=yes">
<style>
html,body{margin:0;height:100%;background:${background}}
body{display:flex;align-items:center;justify-content:center}
svg{display:block;width:100%;height:auto;max-height:100%}
</style>
</head>
<body>${svg}</body>
</html>`;
}

type RawMessage = {
  type?: unknown;
  id?: unknown;
  svg?: unknown;
  width?: unknown;
  height?: unknown;
  png?: unknown;
};

function parseRendered(message: RawMessage, id: string): MermaidMessage | null {
  const { svg, width, height, png } = message;
  if (typeof svg !== "string" || !isPositive(width) || !isPositive(height)) {
    return null;
  }
  const image = typeof png === "string" ? png : null;
  return { type: "rendered", id, svg, width, height, png: image };
}

export function parseMermaidMessage(data: string): MermaidMessage | null {
  let message: RawMessage;
  try {
    message = JSON.parse(data) as RawMessage;
  } catch {
    return null;
  }
  if (message.type === "ready") return { type: "ready" };
  if (typeof message.id !== "string") return null;
  if (message.type === "error") return { type: "error", id: message.id };
  if (message.type === "rendered") return parseRendered(message, message.id);
  return null;
}
