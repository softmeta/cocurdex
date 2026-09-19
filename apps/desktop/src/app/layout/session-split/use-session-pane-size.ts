import { useSetAtom } from "jotai";
import { useRef } from "react";
import { setSessionPaneSizeAtom } from "@/features/sessions";
import { useMountEffect } from "@/lib";

export function useSessionPaneSize(paneId: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const setPaneSize = useSetAtom(setSessionPaneSizeAtom);

  useMountEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) {
        return;
      }
      setPaneSize({
        paneId,
        size: {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        },
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      setPaneSize({ paneId, size: null });
    };
  });

  return ref;
}
