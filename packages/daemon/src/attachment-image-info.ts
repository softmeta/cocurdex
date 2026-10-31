import { readImageInfo } from "@cocurdex/deck/image-info";

export interface AttachmentImageInfo {
  mimeType: string;
  extension: string;
  width: number;
  height: number;
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const IMAGE_ATTACHMENT_MIME_TYPE_BY_EXTENSION: Record<string, string> =
  Object.fromEntries(
    Object.entries(EXTENSION_BY_MIME_TYPE).map(([mimeType, extension]) => [
      extension,
      mimeType,
    ]),
  );

function gifSize(bytes: Buffer) {
  const signature = bytes.toString("latin1", 0, 6);
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  if (bytes.length < 10) return null;
  return {
    mimeType: "image/gif",
    width: bytes.readUInt16LE(6),
    height: bytes.readUInt16LE(8),
  };
}

function webpSize(bytes: Buffer) {
  if (bytes.length < 30) return null;
  if (bytes.toString("latin1", 0, 4) !== "RIFF") return null;
  if (bytes.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = bytes.toString("latin1", 12, 16);
  if (chunk === "VP8 ") {
    return {
      mimeType: "image/webp",
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const b0 = bytes[21] ?? 0;
    const b1 = bytes[22] ?? 0;
    const b2 = bytes[23] ?? 0;
    const b3 = bytes[24] ?? 0;
    return {
      mimeType: "image/webp",
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === "VP8X") {
    return {
      mimeType: "image/webp",
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  return null;
}

export function readAttachmentImageInfo(
  bytes: Buffer,
): AttachmentImageInfo | null {
  const info = readImageInfo(bytes) ?? gifSize(bytes) ?? webpSize(bytes);
  if (!info || info.width <= 0 || info.height <= 0) return null;
  const extension = EXTENSION_BY_MIME_TYPE[info.mimeType];
  if (!extension) return null;
  return { ...info, extension };
}
