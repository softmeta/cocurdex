import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "@/lib/react-hooks";

export type CopyStatus = "copied" | "failed";

export function useTemporaryCopyStatus(durationMs: number) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showCopyStatus = useCallback(
    (nextStatus: CopyStatus) => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      setCopyStatus(nextStatus);
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        setCopyStatus(null);
      }, durationMs);
    },
    [durationMs],
  );

  useMountEffect(() => () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
  });

  return [copyStatus, showCopyStatus] as const;
}
