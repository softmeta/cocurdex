const SUPPORTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
export const MAX_DOC_IMAGE_BYTES = 10 * 1024 * 1024;

export type DocImageRejection = "unsupported" | "tooLarge";

interface FileLike {
  name: string;
  type: string;
  size: number;
}

export function imageFilesOf<T extends FileLike>(
  files: Iterable<T> | null | undefined,
): T[] {
  return Array.from(files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
}

export function docImageRejection(file: FileLike): DocImageRejection | null {
  if (!SUPPORTED_TYPES.has(file.type)) return "unsupported";
  if (file.size > MAX_DOC_IMAGE_BYTES) return "tooLarge";
  return null;
}

export function docImageAlt(fileName: string): string {
  return fileName
    .replace(/\.[^./\\]+$/, "")
    .replace(/[[\]\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
