import type { Rectangle, Size } from "electron";
import type { BrowserViewAnchor } from "../../src/lib/types";

export interface BrowserViewAnchors {
  x?: BrowserViewAnchor;
  y?: BrowserViewAnchor;
}

function predictAxis(
  start: number,
  size: number,
  trailingInset: number,
  delta: number,
  anchor: BrowserViewAnchor | undefined,
  followTrailingEdge: boolean,
): [number, number] {
  if (delta === 0 || anchor === "start") return [start, size];
  if (anchor === "end") return [start + delta, size];
  if (anchor === "stretch") return [start, Math.max(0, size + delta)];
  if (followTrailingEdge && delta > 0 && trailingInset <= 1)
    return [start + delta, size];
  if (delta < 0 && trailingInset > 1) return [start, Math.max(0, size + delta)];
  return [start, size];
}

export function predictBrowserBounds(
  reported: Rectangle,
  reportedViewport: Size,
  viewport: Size,
  anchors: BrowserViewAnchors = {},
): Rectangle {
  const [x, width] = predictAxis(
    reported.x,
    reported.width,
    reportedViewport.width - (reported.x + reported.width),
    viewport.width - reportedViewport.width,
    anchors.x,
    true,
  );
  const [y, height] = predictAxis(
    reported.y,
    reported.height,
    reportedViewport.height - (reported.y + reported.height),
    viewport.height - reportedViewport.height,
    anchors.y,
    false,
  );
  return { x, y, width, height };
}
