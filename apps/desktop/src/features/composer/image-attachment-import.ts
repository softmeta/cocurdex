import {
  type ImageAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import type { ImportImageAttachmentPayload } from "@/lib";
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read image"));
        return;
      }

      resolve(reader.result);
    };

    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl: string) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = document.createElement("img");

    image.onerror = () => reject(new Error("Unable to decode image"));
    image.onload = () => {
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.src = dataUrl;
  });
}

async function fileToPayload(
  file: File,
): Promise<ImportImageAttachmentPayload> {
  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await getImageDimensions(dataUrl);

  return {
    dataUrl,
    height: dimensions.height,
    mimeType: file.type,
    name: file.name,
    sizeBytes: file.size,
    width: dimensions.width,
  };
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

  const dimensions = await getImageDimensions(dataUrl);
  const sizeBytes = Math.floor((dataUrl.length * 3) / 4);

  return desktopApi.importImageAttachment({
    dataUrl,
    height: dimensions.height,
    mimeType,
    name,
    sizeBytes,
    width: dimensions.width,
  });
}

export async function importImageFiles(files: File[]) {
  const imageAttachments: ImageAttachment[] = [];

  for (const file of files) {
    const payload = await fileToPayload(file);
    imageAttachments.push(await desktopApi.importImageAttachment(payload));
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
