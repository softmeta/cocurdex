import { ENTITY_URI_PREFIX } from "./entity-links";

export const DOC_IMAGE_URI_PREFIX = `${ENTITY_URI_PREFIX}image/`;

const STORED_IMAGE_FILE_NAME = /^[A-Za-z0-9-]+\.(gif|jpg|png|webp)$/;
const DOC_IMAGE_MARKDOWN =
  /!\[((?:[^[\]\\\n]|\\.)*)\]\((cocurdex:\/\/image\/[A-Za-z0-9.-]+)\)/g;

export interface DocImageFile {
  uri: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface DocImage extends DocImageFile {
  name: string;
  width: number;
  height: number;
  markdown: string;
}

export interface ImportDocImagePayload {
  path: string;
  name?: string;
}

export interface LocateDocImagePayload {
  uri: string;
}

export interface DocImageMatch {
  index: number;
  length: number;
  alt: string;
  fileName: string;
}

export function isStoredImageFileName(fileName: string): boolean {
  return STORED_IMAGE_FILE_NAME.test(fileName);
}

export function storedImageExtension(fileName: string): string | null {
  return STORED_IMAGE_FILE_NAME.exec(fileName)?.[1] ?? null;
}

export function storedImageFileName(filePath: string): string {
  return filePath.split(/[\\/]+/).at(-1) ?? filePath;
}

export function docImageUri(fileName: string): string {
  return `${DOC_IMAGE_URI_PREFIX}${fileName}`;
}

export function parseDocImageUri(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith(DOC_IMAGE_URI_PREFIX)) return null;
  const fileName = trimmed.slice(DOC_IMAGE_URI_PREFIX.length);
  return isStoredImageFileName(fileName) ? fileName : null;
}

function escapeAlt(alt: string) {
  return alt
    .replace(/\s+/g, " ")
    .replace(/[\\[\]]/g, "\\$&")
    .trim();
}

export function docImageMarkdown(fileName: string, alt: string): string {
  return `![${escapeAlt(alt)}](${docImageUri(fileName)})`;
}

export function findDocImages(markdown: string): DocImageMatch[] {
  const matches: DocImageMatch[] = [];
  for (const match of markdown.matchAll(DOC_IMAGE_MARKDOWN)) {
    const fileName = parseDocImageUri(match[2] ?? "");
    if (!fileName) continue;
    matches.push({
      index: match.index,
      length: match[0].length,
      alt: (match[1] ?? "").replace(/\\(.)/g, "$1"),
      fileName,
    });
  }
  return matches;
}
