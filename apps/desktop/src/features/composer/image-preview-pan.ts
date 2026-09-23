export interface ImagePreviewSize {
  height: number;
  width: number;
}

export interface ImagePreviewPanOffset {
  x: number;
  y: number;
}

export function imagePreviewContentSize(
  image: ImagePreviewSize,
  zoom: number,
  rotation: number,
): ImagePreviewSize {
  const quarterTurn = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  return {
    height: (quarterTurn ? image.width : image.height) * zoom,
    width: (quarterTurn ? image.height : image.width) * zoom,
  };
}

export function clampImagePreviewPan(
  offset: ImagePreviewPanOffset,
  viewport: ImagePreviewSize,
  content: ImagePreviewSize,
): ImagePreviewPanOffset {
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
