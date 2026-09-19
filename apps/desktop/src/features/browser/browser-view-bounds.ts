type BrowserBounds = { x: number; y: number; w: number; h: number };

type BrowserViewBridge = {
  setBrowserBounds: (bounds: BrowserBounds) => Promise<void>;
  browserShow: (visible: boolean) => Promise<void>;
};

export function bindBrowserViewBounds(
  container: HTMLElement,
  bridge: BrowserViewBridge,
) {
  let previous: BrowserBounds | undefined;
  let previousVisible: boolean | undefined;
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
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(top),
      w: Math.round(Math.max(0, right - rect.left)),
      h: Math.round(Math.max(0, bottom - top)),
    };
    if (
      !previous ||
      bounds.x !== previous.x ||
      bounds.y !== previous.y ||
      bounds.w !== previous.w ||
      bounds.h !== previous.h
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
