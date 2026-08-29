import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  importDocumentAttachment,
  initializeAttachmentStorage,
} from "./attachment-service";

describe("document attachment storage", () => {
  beforeEach(async () => {
    initializeAttachmentStorage(
      await mkdtemp(path.join(tmpdir(), "cocurdex-attachments-")),
    );
  });

  it("imports a PDF into managed storage", async () => {
    const bytes = Buffer.from("%PDF-1.7\ntest-document");
    const attachment = await importDocumentAttachment({
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
      importDocumentAttachment({
        dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}`,
        mimeType: "application/pdf",
        name: "sample.pdf",
        sizeBytes: bytes.byteLength,
      }),
    ).rejects.toThrow("valid PDF");
  });
});
