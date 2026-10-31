import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  type DocumentAttachment,
  type ImageAttachment,
  isStoredImageFileName,
  storedImageExtension,
} from "@cocurdex/shared";
import {
  IMAGE_ATTACHMENT_MIME_TYPE_BY_EXTENSION,
  readAttachmentImageInfo,
} from "./attachment-image-info";

const IMAGE_ATTACHMENT_DIR = "image-attachments";
const DOCUMENT_ATTACHMENT_DIR = "document-attachments";
const PDF_MIME_TYPE = "application/pdf";
const PDF_SIGNATURE = Buffer.from("%PDF-");
const IMAGE_HEADER_BYTES = 256 * 1024;
const MAX_NAME_LENGTH = 255;
const STORED_DOCUMENT_FILE = /^[A-Za-z0-9-]+\.pdf$/;

export const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 32 * 1024 * 1024;

export type AttachmentImportFailure = "too-large" | "unsupported" | "invalid";

export class AttachmentImportError extends Error {
  constructor(
    message: string,
    readonly reason: AttachmentImportFailure,
  ) {
    super(message);
    this.name = "AttachmentImportError";
  }
}

export type AttachmentSource =
  | AsyncIterable<Uint8Array>
  | NodeJS.ReadableStream;

function byteLimit(maxBytes: number, onTooLarge: () => Error) {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        callback(onTooLarge());
        return;
      }
      callback(null, chunk);
    },
  });
}

async function readHeader(filePath: string, length: number) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function isStoredDocumentFileName(fileName: string) {
  return STORED_DOCUMENT_FILE.test(fileName);
}

function attachmentName(name: string, fallback: string) {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : fallback;
}

export class DaemonAttachmentStore {
  private readonly imageRootPath: string;
  private readonly documentRootPath: string;

  constructor(userDataPath: string) {
    this.imageRootPath = path.resolve(userDataPath, IMAGE_ATTACHMENT_DIR);
    this.documentRootPath = path.resolve(userDataPath, DOCUMENT_ATTACHMENT_DIR);
  }

  private async receive(
    rootPath: string,
    source: AttachmentSource,
    maxBytes: number,
    tooLargeMessage: string,
  ) {
    await mkdir(rootPath, { recursive: true });
    const tempPath = path.join(rootPath, `.${randomUUID()}.upload`);
    try {
      await pipeline(
        source,
        byteLimit(
          maxBytes,
          () => new AttachmentImportError(tooLargeMessage, "too-large"),
        ),
        createWriteStream(tempPath, { flags: "wx" }),
      );
      const { size } = await stat(tempPath);
      return { tempPath, size };
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  private async commit(tempPath: string, targetPath: string) {
    try {
      await rename(tempPath, targetPath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  async importImage(
    source: AttachmentSource,
    name: string,
  ): Promise<ImageAttachment> {
    const { tempPath, size } = await this.receive(
      this.imageRootPath,
      source,
      MAX_IMAGE_ATTACHMENT_BYTES,
      "Image attachment is too large",
    );
    const info = readAttachmentImageInfo(
      await readHeader(tempPath, IMAGE_HEADER_BYTES),
    );
    if (!info) {
      await rm(tempPath, { force: true });
      throw new AttachmentImportError(
        "Only PNG, JPEG, GIF, or WebP images are supported",
        "unsupported",
      );
    }
    const id = randomUUID();
    const filePath = path.join(this.imageRootPath, `${id}.${info.extension}`);
    await this.commit(tempPath, filePath);
    return {
      kind: "image",
      filePath,
      height: info.height,
      id,
      mimeType: info.mimeType,
      name: attachmentName(name, `image.${info.extension}`),
      sizeBytes: size,
      width: info.width,
    };
  }

  async importDocument(
    source: AttachmentSource,
    name: string,
  ): Promise<DocumentAttachment> {
    const { tempPath, size } = await this.receive(
      this.documentRootPath,
      source,
      MAX_DOCUMENT_ATTACHMENT_BYTES,
      "Document attachment is too large",
    );
    const header = await readHeader(tempPath, PDF_SIGNATURE.byteLength);
    if (!header.equals(PDF_SIGNATURE)) {
      await rm(tempPath, { force: true });
      throw new AttachmentImportError(
        "Document attachment must be a valid PDF",
        "invalid",
      );
    }
    const id = randomUUID();
    const filePath = path.join(this.documentRootPath, `${id}.pdf`);
    await this.commit(tempPath, filePath);
    return {
      filePath,
      id,
      kind: "document",
      mimeType: PDF_MIME_TYPE,
      name: attachmentName(name, "document.pdf"),
      sizeBytes: size,
    };
  }

  isStoredFile(attachment: ImageAttachment | DocumentAttachment) {
    const filePath = path.resolve(attachment.filePath);
    const [rootPath, pattern] =
      attachment.kind === "image"
        ? [this.imageRootPath, isStoredImageFileName]
        : [this.documentRootPath, isStoredDocumentFileName];
    return (
      path.dirname(filePath) === rootPath && pattern(path.basename(filePath))
    );
  }

  async locateImage(fileName: string) {
    const extension = storedImageExtension(fileName);
    const mimeType = extension
      ? IMAGE_ATTACHMENT_MIME_TYPE_BY_EXTENSION[extension]
      : undefined;
    if (!mimeType) return null;
    const filePath = path.join(this.imageRootPath, fileName);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) return null;
      return { path: filePath, size: info.size, mimeType };
    } catch {
      return null;
    }
  }
}
