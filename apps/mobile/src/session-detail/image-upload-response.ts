import type { ImageAttachment } from "@cocurdex/shared";

export type ImageUploadFailure = "tooLarge" | "unsupported" | "failed";

export class ImageUploadError extends Error {
  constructor(readonly reason: ImageUploadFailure) {
    super(`Image upload failed: ${reason}`);
  }
}

const HTTP_TOO_LARGE = 413;
const HTTP_UNSUPPORTED = 415;

export function parseImageUploadResponse(
  status: number,
  body: string,
): ImageAttachment {
  if (status === HTTP_TOO_LARGE) throw new ImageUploadError("tooLarge");
  if (status === HTTP_UNSUPPORTED) throw new ImageUploadError("unsupported");
  if (status < 200 || status >= 300) throw new ImageUploadError("failed");
  const parsed = JSON.parse(body) as Partial<ImageAttachment>;
  if (parsed.kind !== "image" || typeof parsed.filePath !== "string") {
    throw new ImageUploadError("failed");
  }
  return parsed as ImageAttachment;
}
