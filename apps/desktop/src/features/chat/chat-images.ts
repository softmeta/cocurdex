import type { ImageAttachment, MessageAttachment } from "@cocurdex/shared";
import { isImageAttachment } from "@cocurdex/shared";
import { desktopApi } from "@/lib";

// ChatComposer hands back MessageAttachment[] using the agent attachment shape
// (filePath points at a real on-disk file written by
// desktopApi.importImageAttachment). The pure-chat daemon schema requires
// data: URLs, so we rehydrate the file contents before forwarding to the chat
// IPC. Already-inlined data URLs (e.g. pasted images) pass through untouched.
export async function rehydrateChatImages(
  attachments: MessageAttachment[],
): Promise<ImageAttachment[]> {
  const images = attachments.filter(isImageAttachment);
  return Promise.all(
    images.map(async (image) => {
      if (image.filePath.startsWith("data:")) {
        return image;
      }
      const dataUrl = await desktopApi.readImageAttachmentDataUrl(
        image.filePath,
      );
      return { ...image, filePath: dataUrl };
    }),
  );
}
