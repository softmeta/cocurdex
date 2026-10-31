import { useEffect, useEffectEvent, useLayoutEffect, useState } from "react";
import type { PreviewSize } from "./preview-geometry";

function readContentBoxSize(element: HTMLElement): PreviewSize {
  const style = getComputedStyle(element);
  return {
    height:
      element.clientHeight -
      Number.parseFloat(style.paddingTop) -
      Number.parseFloat(style.paddingBottom),
    width:
      element.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight),
  };
}

export function useContentBoxSize(
  element: HTMLElement | null,
): PreviewSize | null {
  const [size, setSize] = useState<PreviewSize | null>(null);

  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    setSize(readContentBoxSize(element));
    const observer = new ResizeObserver(() =>
      setSize(readContentBoxSize(element)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return size;
}

export function useNonPassiveWheel(
  element: HTMLElement | null,
  onWheel: (event: WheelEvent) => void,
) {
  const handleWheel = useEffectEvent(onWheel);

  useEffect(() => {
    if (!element) {
      return;
    }
    const listener = (event: WheelEvent) => handleWheel(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, [element]);
}
