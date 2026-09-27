import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  DocumentAttachment,
  ImageAttachment,
  ImportDocumentAttachmentPayload,
  ImportImageAttachmentPayload,
} from "@cocurdex/shared";

const IMAGE_ATTACHMENT_DIR = "image-attachments";
const DOCUMENT_ATTACHMENT_DIR = "document-attachments";
const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PDF_MIME_TYPE = "application/pdf";
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;

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

function isInside(rootPath: string, targetPath: string) {
  return targetPath.startsWith(`${rootPath}${path.sep}`);
}

export class DaemonAttachmentStore {
  private readonly imageRootPath: string;
  private readonly documentRootPath: string;

  constructor(userDataPath: string) {
    this.imageRootPath = path.resolve(userDataPath, IMAGE_ATTACHMENT_DIR);
    this.documentRootPath = path.resolve(userDataPath, DOCUMENT_ATTACHMENT_DIR);
  }

  async importImage(
    payload: ImportImageAttachmentPayload,
  ): Promise<ImageAttachment> {
    const extension = IMAGE_EXTENSION_BY_MIME_TYPE[payload.mimeType];
    if (!extension) {
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
    const filePath = path.join(this.imageRootPath, `${id}.${extension}`);
    await mkdir(this.imageRootPath, { recursive: true });
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

  async importDocument(
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
    const filePath = path.join(this.documentRootPath, `${id}.pdf`);
    await mkdir(this.documentRootPath, { recursive: true });
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

  async readImageDataUrl(filePath: string) {
    const resolvedPath = path.resolve(filePath);
    if (!isInside(this.imageRootPath, resolvedPath)) {
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
}
