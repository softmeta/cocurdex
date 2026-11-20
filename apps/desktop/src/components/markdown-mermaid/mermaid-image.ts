import type { SizedMermaidSvg } from "./mermaid-svg";

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const MIN_EXPORT_SCALE = 2;

export function opaqueBackgroundOf(element: Element | null): string {
  for (let node = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== TRANSPARENT && color !== "transparent") {
      return color;
    }
  }
  return getComputedStyle(document.body).backgroundColor;
}

function toXmlSvg(svg: string): string {
  const element = new DOMParser()
    .parseFromString(svg, "text/html")
    .querySelector("svg");
  if (!element) {
    throw new Error("Mermaid output has no SVG element");
  }
  return new XMLSerializer().serializeToString(element);
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Mermaid SVG failed to load"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toXmlSvg(svg))}`;
  });
}

export async function mermaidPngBlob(
  diagram: SizedMermaidSvg,
  background: string,
): Promise<Blob> {
  const scale = Math.max(MIN_EXPORT_SCALE, window.devicePixelRatio);
  const image = await loadSvgImage(diagram.svg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(diagram.width * scale);
  canvas.height = Math.ceil(diagram.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable");
  }
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Mermaid PNG encoding failed"));
    }, "image/png");
  });
}

export async function copyMermaidImage(
  diagram: SizedMermaidSvg,
  backgroundSource: Element | null,
): Promise<void> {
  const png = mermaidPngBlob(diagram, opaqueBackgroundOf(backgroundSource));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
