import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentAttachment, ImageAttachment } from "@cocurdex/shared";

const IMAGE_ATTACHMENT_DIR = "image-attachments";
const DOCUMENT_ATTACHMENT_DIR = "document-attachments";
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PDF_MIME_TYPE = "application/pdf";
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;

export interface ImportImageAttachmentPayload {
  dataUrl: string;
  height: number;
  mimeType: string;
  name: string;
  sizeBytes: number;
  width: number;
}

export interface ImportDocumentAttachmentPayload {
  dataUrl: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
}

let imageAttachmentRootPath = "";
let documentAttachmentRootPath = "";

export function initializeAttachmentStorage(userDataPath: string) {
  imageAttachmentRootPath = path.join(userDataPath, IMAGE_ATTACHMENT_DIR);
  documentAttachmentRootPath = path.join(userDataPath, DOCUMENT_ATTACHMENT_DIR);
}

function requireAttachmentStorage(rootPath: string) {
  if (!rootPath) {
    throw new Error("Attachment storage is not initialized");
  }

  return rootPath;
}

function decodeAttachmentDataUrl(dataUrl: string, expectedMimeType: string) {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) {
    throw new Error("Attachment data must be a base64 data URL");
  }

  const [, actualMimeType, base64Data] = match;
  if (actualMimeType !== expectedMimeType) {
    throw new Error("Attachment MIME type does not match its data URL");
  }

  return Buffer.from(base64Data, "base64");
}

export async function importImageAttachment(
  payload: ImportImageAttachmentPayload,
): Promise<ImageAttachment> {
  if (!SUPPORTED_IMAGE_TYPES.has(payload.mimeType)) {
    throw new Error("Unsupported image attachment type");
  }

  if (payload.sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error("Image attachment is too large");
  }

  if (payload.width <= 0 || payload.height <= 0) {
    throw new Error("Image attachment dimensions are invalid");
  }

  const bytes = decodeAttachmentDataUrl(payload.dataUrl, payload.mimeType);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image attachment is too large");
  }

  const id = randomUUID();
  const extension = IMAGE_EXTENSION_BY_MIME_TYPE[payload.mimeType] ?? "img";
  const rootPath = requireAttachmentStorage(imageAttachmentRootPath);
  const filePath = path.join(rootPath, `${id}.${extension}`);

  await mkdir(rootPath, { recursive: true });
  await writeFile(filePath, bytes);

  return {
    kind: "image",
    filePath,
    height: payload.height,
    id,
    mimeType: payload.mimeType,
    name: payload.name || `image.${extension}`,
    sizeBytes: bytes.byteLength,
    width: payload.width,
  };
}

export async function importDocumentAttachment(
  payload: ImportDocumentAttachmentPayload,
): Promise<DocumentAttachment> {
  if (payload.mimeType !== PDF_MIME_TYPE) {
    throw new Error("Unsupported document attachment type");
  }

  if (payload.sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new Error("Document attachment is too large");
  }

  const bytes = decodeAttachmentDataUrl(payload.dataUrl, payload.mimeType);
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("Document attachment is too large");
  }
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Document attachment must be a valid PDF");
  }

  const id = randomUUID();
  const rootPath = requireAttachmentStorage(documentAttachmentRootPath);
  const filePath = path.join(rootPath, `${id}.pdf`);

  await mkdir(rootPath, { recursive: true });
  await writeFile(filePath, bytes);

  return {
    filePath,
    id,
    kind: "document",
    mimeType: PDF_MIME_TYPE,
    name: payload.name || "document.pdf",
    sizeBytes: bytes.byteLength,
  };
}

export async function readImageAttachmentDataUrl(filePath: string) {
  const rootPath = requireAttachmentStorage(imageAttachmentRootPath);
  const resolvedPath = path.resolve(filePath);
  const resolvedRootPath = path.resolve(rootPath);

  if (
    resolvedPath !== resolvedRootPath &&
    !resolvedPath.startsWith(`${resolvedRootPath}${path.sep}`)
  ) {
    throw new Error("Image attachment is outside managed storage");
  }

  const bytes = await readFile(resolvedPath);
  const extension = path.extname(resolvedPath).toLowerCase().slice(1);
  const mimeType =
    Object.entries(IMAGE_EXTENSION_BY_MIME_TYPE).find(
      ([, value]) => value === extension,
    )?.[0] ?? "application/octet-stream";

  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}
