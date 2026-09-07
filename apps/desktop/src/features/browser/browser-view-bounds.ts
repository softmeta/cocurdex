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
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
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
