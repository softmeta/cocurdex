import type { ImageAttachment } from "@cocurdex/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { desktopApi, useMountEffect } from "@/lib";

export type ImageCopyStatus = "copied" | "failed";

// Reads the attachment's data URL through IPC, keyed by file path. Already-
// inlined data URLs (conversation messages) pass through without a round trip.
// Errors surface as null (placeholder icon). The cancelled guard drops a late
// resolve if the path changes or the component unmounts mid-read.
export function useImageDataUrl(attachment: ImageAttachment) {
  const { filePath } = attachment;
  const inlineDataUrl = filePath.startsWith("data:") ? filePath : null;
  const [fetched, setFetched] = useState<{
    path: string;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    if (inlineDataUrl) {
      return;
    }

    let cancelled = false;
    desktopApi
      .readImageAttachmentDataUrl(filePath)
      .then((url) => {
        if (!cancelled) {
          setFetched({ path: filePath, url });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetched({ path: filePath, url: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, inlineDataUrl]);

  const fetchedUrl = fetched?.path === filePath ? fetched.url : null;
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

  useMountEffect(() => () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
  });

  return [copyStatus, showCopyStatus] as const;
}
