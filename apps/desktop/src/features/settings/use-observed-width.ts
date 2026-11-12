import { useCallback, useState } from "react";

export function useObservedWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const ref = useCallback((node: T | null) => {
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
