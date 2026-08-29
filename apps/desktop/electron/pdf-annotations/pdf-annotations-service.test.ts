import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPdfAnnotationsStoragePath,
  initializePdfAnnotationsStorage,
  loadPdfDocumentAnnotations,
  pdfAnnotationsStorageKey,
  savePdfDocumentAnnotations,
} from "./pdf-annotations-service";

describe("pdf annotations storage", () => {
  it("round-trips bookmarks and highlights under userData", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    initializePdfAnnotationsStorage(userDataPath);

    const filePath = path.join(userDataPath, "papers", "paper.pdf");
    const annotations = {
      bookmarks: [
        {
          id: "bm-1",
          pageNumber: 2,
          createdAt: 100,
          label: "Chapter",
        },
      ],
      highlights: [
        {
          id: "hl-1",
          pageNumber: 3,
          color: "green" as const,
          selectedText: "quoted",
          quads: [{ x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.25 }],
          createdAt: 200,
        },
      ],
    };

    await savePdfDocumentAnnotations(filePath, annotations);

    const storagePath = path.join(
      getPdfAnnotationsStoragePath(userDataPath),
      `${pdfAnnotationsStorageKey(path.resolve(filePath))}.json`,
    );
    const onDisk = JSON.parse(await readFile(storagePath, "utf8")) as {
      version: number;
      filePath: string;
    };
    expect(onDisk.version).toBe(1);
    expect(onDisk.filePath).toBe(path.resolve(filePath));

    await expect(loadPdfDocumentAnnotations(filePath)).resolves.toEqual(
      annotations,
    );
  });

  it("returns empty annotations when no file exists", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    initializePdfAnnotationsStorage(userDataPath);

    await expect(
      loadPdfDocumentAnnotations(path.join(userDataPath, "missing.pdf")),
    ).resolves.toEqual({ bookmarks: [], highlights: [] });
  });

  it("deletes the storage file when annotations become empty", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    initializePdfAnnotationsStorage(userDataPath);

    const filePath = path.join(userDataPath, "doc.pdf");
    await savePdfDocumentAnnotations(filePath, {
      bookmarks: [{ id: "bm-1", pageNumber: 1, createdAt: 1 }],
      highlights: [],
    });

    await savePdfDocumentAnnotations(filePath, {
      bookmarks: [],
      highlights: [],
    });

    await expect(loadPdfDocumentAnnotations(filePath)).resolves.toEqual({
      bookmarks: [],
      highlights: [],
    });
  });
});
