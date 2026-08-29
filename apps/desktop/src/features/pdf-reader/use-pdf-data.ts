import { useState } from "react";
import { desktopApi, useMountEffect } from "@/lib";

export type PdfLoadStatus = "loading" | "ready" | "error";

// Resolves the pdf-asset URL through IPC. Mount-only: PdfViewer remounts
// (via key) when the file changes, so filePath is stable for this instance's
// lifetime. The cancelled guard drops a late IPC resolve if we unmount
// mid-read so it never sets state on a torn-down component.
export function usePdfData(filePath: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PdfLoadStatus>("loading");

  useMountEffect(() => {
    let cancelled = false;
    desktopApi
      .readPdfData({ filePath })
      .then((pdfUrl) => {
        if (!cancelled) setUrl(pdfUrl);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  });

  return { url, status, setStatus };
}
