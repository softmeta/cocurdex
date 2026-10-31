import { useLayoutEffect, useState } from "react";

export function useElementHeight(element: HTMLElement | null) {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    setHeight(element.clientHeight);
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return height;
}
