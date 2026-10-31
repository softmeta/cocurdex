export interface MenuAnchor {
  x: number;
  y: number;
  top?: number;
}

export interface MenuBounds {
  top: number;
  bottom: number;
}

const ANCHOR_GAP = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function menuTop(
  anchor: MenuAnchor,
  height: number,
  bounds: MenuBounds,
) {
  const below = anchor.y + ANCHOR_GAP;
  if (below + height <= bounds.bottom) return below;
  const above = (anchor.top ?? anchor.y) - ANCHOR_GAP - height;
  return clamp(above, bounds.top, bounds.bottom - height);
}
