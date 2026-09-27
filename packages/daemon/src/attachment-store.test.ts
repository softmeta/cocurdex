import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DaemonAttachmentStore } from "./attachment-store";

const PNG_BYTES = Buffer.from("png-bytes");

function imagePayload() {
  return {
    dataUrl: `data:image/png;base64,${PNG_BYTES.toString("base64")}`,
    height: 1,
    mimeType: "image/png",
    name: "shot.png",
    sizeBytes: PNG_BYTES.byteLength,
    width: 1,
  };
}

describe("DaemonAttachmentStore", () => {
  let store: DaemonAttachmentStore;
  let userDataPath: string;

  beforeEach(async () => {
    userDataPath = await mkdtemp(path.join(tmpdir(), "cocurdex-attachments-"));
    store = new DaemonAttachmentStore(userDataPath);
  });

  it("imports a PDF into managed storage", async () => {
    const bytes = Buffer.from("%PDF-1.7\ntest-document");
    const attachment = await store.importDocument({
      dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}`,
      mimeType: "application/pdf",
      name: "sample.pdf",
      sizeBytes: bytes.byteLength,
    });

    expect(attachment).toMatchObject({
      kind: "document",
      mimeType: "application/pdf",
      name: "sample.pdf",
      sizeBytes: bytes.byteLength,
    });
    await expect(readFile(attachment.filePath)).resolves.toEqual(bytes);
  });

  it("rejects content that is not a PDF", async () => {
    const bytes = Buffer.from("not-a-pdf");

    await expect(
      store.importDocument({
        dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}`,
        mimeType: "application/pdf",
        name: "sample.pdf",
        sizeBytes: bytes.byteLength,
      }),
    ).rejects.toThrow("valid PDF");
  });

  it("round-trips an imported image as a data URL", async () => {
    const attachment = await store.importImage(imagePayload());

    await expect(store.readImageDataUrl(attachment.filePath)).resolves.toBe(
      imagePayload().dataUrl,
    );
  });

  it("refuses to read images outside managed storage", async () => {
    await expect(
      store.readImageDataUrl(path.join(userDataPath, "cocurdex.sqlite")),
    ).rejects.toThrow("outside managed storage");
  });
});
