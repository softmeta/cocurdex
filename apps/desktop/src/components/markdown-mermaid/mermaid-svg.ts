export interface SizedMermaidSvg {
  height: number;
  svg: string;
  width: number;
}

const SVG_OPEN_TAG = /<svg\b[^>]*>/i;
const VIEW_BOX_ATTRIBUTE = /\sviewBox=(["'])(.*?)\1/i;
const SIZE_ATTRIBUTES = /\s(?:width|height)=(["']).*?\1/gi;
const STYLE_ATTRIBUTE = /\sstyle=(["']).*?\1/i;
const VIEW_BOX_SEPARATOR = /[\s,]+/;

export function sizeMermaidSvg(svg: string): SizedMermaidSvg | null {
  const openTag = svg.match(SVG_OPEN_TAG)?.[0];
  const viewBox = openTag?.match(VIEW_BOX_ATTRIBUTE)?.[2];
  if (!openTag || !viewBox) {
    return null;
  }

  const [, , width, height] = viewBox
    .trim()
    .split(VIEW_BOX_SEPARATOR)
    .map(Number);
  if (!(width > 0 && height > 0)) {
    return null;
  }

  const sizedTag = openTag
    .replace(SIZE_ATTRIBUTES, "")
    .replace(STYLE_ATTRIBUTE, "")
    .replace(/^<svg/i, `<svg width="${width}" height="${height}"`);

  return { height, svg: svg.replace(openTag, () => sizedTag), width };
}
