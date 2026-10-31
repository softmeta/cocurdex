import {
  type ImageAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { desktopApi } from "@/lib";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES_PER_MESSAGE = 6;

export function getImageAttachmentLimitError() {
  return "Attach up to 6 images per message.";
}

export function getImageAttachmentValidationError(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return "Only PNG, JPEG, GIF, or WebP images are supported.";
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return "Images must be 10 MB or smaller.";
  }

  return null;
}

export async function importImageDataUrl(dataUrl: string, name: string) {
  const match = /^data:([^;,]+);base64,/u.exec(dataUrl);
  if (!match) {
    throw new Error("Image data must be a base64 data URL");
  }

  const mimeType = match[1];
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("Only PNG, JPEG, GIF, or WebP images are supported.");
  }

  const image = await (await fetch(dataUrl)).blob();
  return desktopApi.importImageAttachment(image, name);
}

export async function importImageFiles(files: File[]) {
  const imageAttachments: ImageAttachment[] = [];

  for (const file of files) {
    imageAttachments.push(
      await desktopApi.importImageAttachment(file, file.name),
    );
  }

  return imageAttachments;
}

export function filterSupportedImageFiles(files: File[]) {
  return files.filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
}

export function canAddImageAttachments(
  attachments: MessageAttachment[],
  nextImageCount: number,
) {
  const currentImageCount = attachments.filter(isImageAttachment).length;
  return currentImageCount + nextImageCount <= MAX_IMAGES_PER_MESSAGE;
}
