import type { BrowserViewAnchor, BrowserViewBounds } from "@/lib/types";
import { learnBrowserViewAnchor } from "./browser-view-anchor";

type BrowserViewBridge = {
  setBrowserBounds: (bounds: BrowserViewBounds) => Promise<void>;
  browserShow: (visible: boolean) => Promise<void>;
};

export function bindBrowserViewBounds(
  container: HTMLElement,
  bridge: BrowserViewBridge,
) {
  let previous: BrowserViewBounds | undefined;
  let previousVisible: boolean | undefined;
  let anchorX: BrowserViewAnchor | undefined;
  let anchorY: BrowserViewAnchor | undefined;
  let frame = 0;

  const synchronize = () => {
    const rect = container.getBoundingClientRect();
    // The native view paints above all DOM and cannot be clipped by
    // overflow, so clip the reported rect against ancestor scroll boxes:
    // a horizontally panned container must not draw over a pinned chat rail
    // on the trailing edge. The x edge follows the element itself — whatever
    // slides past a left clip lands off-window and is invisible anyway, which
    // is what lets horizontal panning reveal the covered side.
    let top = rect.top;
    let right = rect.left + rect.width;
    let bottom = rect.top + rect.height;
    for (let node = container.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const clips = (value: string) =>
        value === "auto" ||
        value === "hidden" ||
        value === "scroll" ||
        value === "clip";
      if (!clips(style.overflowX) && !clips(style.overflowY)) {
        continue;
      }
      const clip = node.getBoundingClientRect();
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    }
    const x = Math.round(rect.left);
    const y = Math.round(top);
    const w = Math.round(Math.max(0, right - rect.left));
    const h = Math.round(Math.max(0, bottom - top));
    if (previous) {
      anchorX = learnBrowserViewAnchor(
        { start: previous.x, size: previous.w },
        { start: x, size: w },
        window.innerWidth - previous.viewportWidth,
        anchorX,
      );
      anchorY = learnBrowserViewAnchor(
        { start: previous.y, size: previous.h },
        { start: y, size: h },
        window.innerHeight - previous.viewportHeight,
        anchorY,
      );
    }
    const bounds: BrowserViewBounds = {
      x,
      y,
      w,
      h,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      anchorX,
      anchorY,
    };
    if (
      !previous ||
      bounds.x !== previous.x ||
      bounds.y !== previous.y ||
      bounds.w !== previous.w ||
      bounds.h !== previous.h ||
      bounds.viewportWidth !== previous.viewportWidth ||
      bounds.viewportHeight !== previous.viewportHeight
    ) {
      previous = bounds;
      void bridge.setBrowserBounds(bounds);
    }
    const visible =
      !container.closest('[aria-hidden="true"]') &&
      bounds.w > 0 &&
      bounds.h > 0;
    if (visible !== previousVisible) {
      previousVisible = visible;
      void bridge.browserShow(visible);
    }
    frame = requestAnimationFrame(synchronize);
  };

  synchronize();

  return () => {
    cancelAnimationFrame(frame);
    void bridge.browserShow(false);
  };
}
