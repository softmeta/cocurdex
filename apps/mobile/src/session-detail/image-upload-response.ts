export type ImageUploadFailure = "tooLarge" | "unsupported" | "failed";

export class ImageUploadError extends Error {
  constructor(readonly reason: ImageUploadFailure) {
    super(`Image upload failed: ${reason}`);
  }
}

export function imageUploadFailure(reason: string): ImageUploadFailure {
  if (reason === "tooLarge") return "tooLarge";
  if (reason === "unsupported" || reason === "invalid") return "unsupported";
  return "failed";
}
