import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { readAttachmentImageInfo } from "@cocurdex/daemon/internal/attachment-image-info";
import {
  AttachmentImportError,
  DaemonAttachmentStore,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from "@cocurdex/daemon/internal/attachment-store";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

function pngBytes(width: number, height: number) {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function gifBytes(width: number, height: number) {
  const bytes = Buffer.alloc(13);
  bytes.write("GIF89a", 0, "latin1");
  bytes.writeUInt16LE(width, 6);
  bytes.writeUInt16LE(height, 8);
  return bytes;
}

function webpBytes(chunk: string, body: Buffer) {
  const bytes = Buffer.alloc(20 + body.length);
  bytes.write("RIFF", 0, "latin1");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WEBP", 8, "latin1");
  bytes.write(chunk, 12, "latin1");
  bytes.writeUInt32LE(body.length, 16);
  body.copy(bytes, 20);
  return bytes;
}

function vp8Body(width: number, height: number) {
  const body = Buffer.alloc(10);
  Buffer.from([0x9d, 0x01, 0x2a]).copy(body, 3);
  body.writeUInt16LE(width, 6);
  body.writeUInt16LE(height, 8);
  return body;
}

function vp8lBody(width: number, height: number) {
  const w = width - 1;
  const h = height - 1;
  return Buffer.from([
    0x2f,
    w & 0xff,
    ((w >> 8) & 0x3f) | ((h & 0x03) << 6),
    (h >> 2) & 0xff,
    (h >> 10) & 0x0f,
    0,
    0,
    0,
    0,
    0,
  ]);
}

function vp8xBody(width: number, height: number) {
  const body = Buffer.alloc(10);
  body.writeUIntLE(width - 1, 4, 3);
  body.writeUIntLE(height - 1, 7, 3);
  return body;
}

async function* chunks(count: number, size: number) {
  for (let index = 0; index < count; index += 1) {
    yield Buffer.alloc(size, index === 0 ? 0x89 : 0);
  }
}

describe("readAttachmentImageInfo", () => {
  it.each([
    ["png", pngBytes(640, 480), "image/png", "png", 640, 480],
    ["gif", gifBytes(32, 16), "image/gif", "gif", 32, 16],
    [
      "lossy webp",
      webpBytes("VP8 ", vp8Body(300, 200)),
      "image/webp",
      "webp",
      300,
      200,
    ],
    [
      "lossless webp",
      webpBytes("VP8L", vp8lBody(1024, 769)),
      "image/webp",
      "webp",
      1024,
      769,
    ],
    [
      "extended webp",
      webpBytes("VP8X", vp8xBody(4000, 3000)),
      "image/webp",
      "webp",
      4000,
      3000,
    ],
  ])(
    "reads %s dimensions",
    (_label, bytes, mimeType, extension, width, height) => {
      expect(readAttachmentImageInfo(bytes)).toEqual({
        mimeType,
        extension,
        width,
        height,
      });
    },
  );

  it("rejects bytes that are not a supported image", () => {
    expect(readAttachmentImageInfo(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(readAttachmentImageInfo(gifBytes(0, 10))).toBeNull();
  });
});

describe("DaemonAttachmentStore", () => {
  let store: DaemonAttachmentStore;
  let userDataPath: string;

  async function storedFiles(dir: string) {
    try {
      return await readdir(path.join(userDataPath, dir));
    } catch {
      return [];
    }
  }

  beforeEach(async () => {
    userDataPath = await tempDirs.create("cocurdex-attachments-");
    store = new DaemonAttachmentStore(userDataPath);
  });

  it("streams a PDF into managed storage", async () => {
    const bytes = Buffer.from("%PDF-1.7\ntest-document");
    const attachment = await store.importDocument(
      Readable.from([bytes.subarray(0, 4), bytes.subarray(4)]),
      "sample.pdf",
    );

    expect(attachment).toMatchObject({
      kind: "document",
      mimeType: "application/pdf",
      name: "sample.pdf",
      sizeBytes: bytes.byteLength,
    });
    await expect(readFile(attachment.filePath)).resolves.toEqual(bytes);
  });

  it("rejects content that is not a PDF and keeps nothing", async () => {
    await expect(
      store.importDocument(Readable.from([Buffer.from("not-a-pdf")]), "x.pdf"),
    ).rejects.toThrow("valid PDF");
    expect(await storedFiles("document-attachments")).toEqual([]);
  });

  it("derives the image type and size from its bytes", async () => {
    const attachment = await store.importImage(
      Readable.from([gifBytes(32, 16)]),
      "",
    );

    expect(attachment).toMatchObject({
      kind: "image",
      mimeType: "image/gif",
      name: "image.gif",
      width: 32,
      height: 16,
      sizeBytes: 13,
    });
    expect(attachment.filePath.endsWith(`${attachment.id}.gif`)).toBe(true);
  });

  it("stops an image upload past the size limit and keeps nothing", async () => {
    const error = await store
      .importImage(chunks(11, 1024 * 1024), "big.png")
      .catch((caught: unknown) => caught);

    expect(11 * 1024 * 1024).toBeGreaterThan(MAX_IMAGE_ATTACHMENT_BYTES);
    expect(error).toBeInstanceOf(AttachmentImportError);
    expect((error as AttachmentImportError).reason).toBe("too-large");
    expect(await storedFiles("image-attachments")).toEqual([]);
  });

  it("locates stored images by file name only", async () => {
    const attachment = await store.importImage(
      Readable.from([pngBytes(2, 2)]),
      "shot.png",
    );
    const fileName = path.basename(attachment.filePath);

    await expect(store.locateImage(fileName)).resolves.toEqual({
      path: attachment.filePath,
      size: 33,
      mimeType: "image/png",
    });
    await expect(store.locateImage("../cocurdex.sqlite")).resolves.toBeNull();
    await expect(store.locateImage(`${attachment.id}.pdf`)).resolves.toBeNull();
    await expect(store.locateImage("missing.png")).resolves.toBeNull();
  });
});
