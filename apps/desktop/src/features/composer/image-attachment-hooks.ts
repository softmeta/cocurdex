import type { ImageAttachment } from "@cocurdex/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { desktopApi } from "@/lib";

export type ImageCopyStatus = "copied" | "failed";

// Reads the attachment's data URL through IPC, keyed by file path. Already-
// inlined data URLs (conversation messages) pass through without a round trip.
// Errors surface as null (placeholder icon). The cancelled guard drops a late
// resolve if the path changes or the component unmounts mid-read.
export function useImageDataUrl(attachment: ImageAttachment) {
  const { filePath } = attachment;
  const inlineDataUrl = filePath.startsWith("data:") ? filePath : null;
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (inlineDataUrl) {
      return;
    }

    let cancelled = false;
    setFetchedUrl(null);
    desktopApi
      .readImageAttachmentDataUrl(filePath)
      .then((url) => {
        if (!cancelled) {
          setFetchedUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, inlineDataUrl]);

  return inlineDataUrl ?? fetchedUrl;
}

export function useTemporaryImageCopyStatus(durationMs: number) {
  const [copyStatus, setCopyStatus] = useState<ImageCopyStatus | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showCopyStatus = useCallback(
    (nextStatus: ImageCopyStatus) => {
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

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [copyStatus, showCopyStatus] as const;
}
