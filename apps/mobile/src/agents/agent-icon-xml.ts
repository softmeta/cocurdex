import type { AgentBrandIcon } from "@cocurdex/shared";

function attribute(name: string, value: string | number | undefined) {
  return value === undefined ? "" : ` ${name}="${value}"`;
}

export function brandIconXml(icon: AgentBrandIcon, color: string) {
  const fill = icon.color ?? color;
  const paths = icon.paths
    .map((path) => {
      const rule = path.evenOdd ? "evenodd" : undefined;
      return `<path d="${path.d}"${attribute("fill", fill)}${attribute("fill-rule", rule)}${attribute("clip-rule", rule)}${attribute("opacity", path.opacity)}/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}">${paths}</svg>`;
}

export function fallbackIconXml(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>`;
}

export function tintedIconXml(xml: string, color: string) {
  return xml.replaceAll("currentColor", color);
}
