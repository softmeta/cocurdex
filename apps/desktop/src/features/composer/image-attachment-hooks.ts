import {
  buildDaemonImageAttachmentUrl,
  type ImageAttachment,
} from "@cocurdex/shared";
import { useCallback, useRef, useState } from "react";
import { createDaemonBlobUrlStore, useMountEffect } from "@/lib";

export type ImageCopyStatus = "copied" | "failed";

const useImageAttachmentBlobUrl = createDaemonBlobUrlStore({
  buildUrl: buildDaemonImageAttachmentUrl,
  failureDiagnostic: "composer.imageAttachmentLoadFailed",
});

export function useImageDataUrl(attachment: ImageAttachment) {
  const { filePath } = attachment;
  const inlineDataUrl = filePath.startsWith("data:") ? filePath : null;
  const storedUrl = useImageAttachmentBlobUrl(
    inlineDataUrl || filePath.length === 0 ? null : filePath,
  );
  return inlineDataUrl ?? storedUrl;
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
