import type { BrowserAnnotation } from "@cocurdex/shared";

function describeTarget(annotation: BrowserAnnotation): string {
  const { x, y, width, height } = annotation.boundingBox;
  if (annotation.type === "region")
    return `Region ${width}×${height} at (${x}, ${y})`;
  const tag = annotation.tagName ? `<${annotation.tagName}>` : "Element";
  const text = annotation.textContent ? ` "${annotation.textContent}"` : "";
  return `${tag}${text}`;
}

function describeAnnotation(annotation: BrowserAnnotation, index: number) {
  const lines = [`${index + 1}. ${describeTarget(annotation)}`];
  if (annotation.selector) lines.push(`   Selector: ${annotation.selector}`);
  if (annotation.note) lines.push(`   Comment: ${annotation.note}`);
  for (const change of annotation.styleChanges ?? [])
    lines.push(
      `   Style preview: ${change.property} ${change.from} → ${change.to}`,
    );
  return lines.join("\n");
}

export function annotationScreenshotName(index: number) {
  return `browser-annotation-${index + 1}.png`;
}

export function formatBrowserAnnotations(
  annotations: BrowserAnnotation[],
): string {
  if (annotations.length === 0) return "";
  const pages = [...new Set(annotations.map((a) => a.pageUrl))];
  const header = [
    "[Browser Annotations]",
    `Page: ${pages.join(", ")}`,
    "Screenshot browser-annotation-N.png shows annotation N.",
  ];
  const body = annotations.map(describeAnnotation);
  return [...header, ...body].join("\n");
}

export function withBrowserAnnotations(
  message: string,
  annotations: BrowserAnnotation[],
): string {
  const context = formatBrowserAnnotations(annotations);
  if (!context) return message;
  return message ? `${message}\n\n${context}` : context;
}
