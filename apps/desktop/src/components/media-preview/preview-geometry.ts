export interface PreviewSize {
  height: number;
  width: number;
}

export interface PreviewPanOffset {
  x: number;
  y: number;
}

export interface PreviewScaleLimits {
  max: number;
  min: number;
}

function isQuarterTurn(rotation: number): boolean {
  return Math.abs(Math.round(rotation / 90)) % 2 === 1;
}

export function previewBaseScale(
  content: PreviewSize,
  viewport: PreviewSize,
  limits: PreviewScaleLimits,
): number {
  const widthFit = viewport.width / content.width;
  const fit = Math.min(widthFit, viewport.height / content.height);
  const floor = Math.min(limits.min, widthFit);
  return Math.min(limits.max, Math.max(fit, floor));
}

export function previewFrameSize(
  content: PreviewSize,
  viewport: PreviewSize,
  rotation: number,
  limits: PreviewScaleLimits,
): PreviewSize {
  const turned = isQuarterTurn(rotation)
    ? { height: content.width, width: content.height }
    : content;
  const scale = previewBaseScale(turned, viewport, limits);
  return { height: content.height * scale, width: content.width * scale };
}

export function previewContentSize(
  image: PreviewSize,
  zoom: number,
  rotation: number,
): PreviewSize {
  const quarterTurn = isQuarterTurn(rotation);
  return {
    height: (quarterTurn ? image.width : image.height) * zoom,
    width: (quarterTurn ? image.height : image.width) * zoom,
  };
}

export function clampPreviewPan(
  offset: PreviewPanOffset,
  viewport: PreviewSize,
  content: PreviewSize,
): PreviewPanOffset {
  return {
    x: clampPanAxis(offset.x, content.width - viewport.width),
    y: clampPanAxis(offset.y, content.height - viewport.height),
  };
}

function clampPanAxis(value: number, overflow: number): number {
  const limit = Math.max(0, overflow / 2);
  const clamped = Math.min(limit, Math.max(-limit, value));
  return clamped === 0 ? 0 : clamped;
}
