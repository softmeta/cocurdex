import { useState } from "react";
import { type PdfSource, resolvePdfSource, useMountEffect } from "@/lib";

export type PdfLoadStatus = "loading" | "ready" | "error";

export function usePdfData(filePath: string) {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [status, setStatus] = useState<PdfLoadStatus>("loading");

  useMountEffect(() => {
    let cancelled = false;
    resolvePdfSource(filePath)
      .then((resolved) => {
        if (!cancelled) setSource(resolved);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  });

  return { source, status, setStatus };
}
