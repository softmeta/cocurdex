import { type ImageAttachment, storedImageFileName } from "@cocurdex/shared";
import { createDaemonBlobUrlStore } from "@/lib";

const useImageAttachmentBlobUrl = createDaemonBlobUrlStore({
  request: (filePath) => ({
    kind: "imageAttachment",
    file: storedImageFileName(filePath),
  }),
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
