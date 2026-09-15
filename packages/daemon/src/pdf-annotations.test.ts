import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DaemonPdfAnnotationsService,
  pdfAnnotationsStorageKey,
} from "./pdf-annotations";

function createService(userDataPath: string, workspaceRootPath: string) {
  return new DaemonPdfAnnotationsService(userDataPath, async () => [
    workspaceRootPath,
  ]);
}

describe("pdf annotations storage", () => {
  it("round-trips bookmarks and highlights under userData", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    const workspaceRootPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-workspace-"),
    );
    const service = createService(userDataPath, workspaceRootPath);

    const filePath = path.join(workspaceRootPath, "papers", "paper.pdf");
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

    await service.saveAnnotations(filePath, annotations);

    const storagePath = path.join(
      userDataPath,
      "pdf-annotations",
      `${pdfAnnotationsStorageKey(path.resolve(filePath))}.json`,
    );
    const onDisk = JSON.parse(await readFile(storagePath, "utf8")) as {
      version: number;
      filePath: string;
    };
    expect(onDisk.version).toBe(1);
    expect(onDisk.filePath).toBe(path.resolve(filePath));

    await expect(service.loadAnnotations(filePath)).resolves.toEqual(
      annotations,
    );
  });

  it("returns empty annotations when no file exists", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    const workspaceRootPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-workspace-"),
    );
    const service = createService(userDataPath, workspaceRootPath);

    await expect(
      service.loadAnnotations(path.join(workspaceRootPath, "missing.pdf")),
    ).resolves.toEqual({ bookmarks: [], highlights: [] });
  });

  it("deletes the storage file when annotations become empty", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    const workspaceRootPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-workspace-"),
    );
    const service = createService(userDataPath, workspaceRootPath);

    const filePath = path.join(workspaceRootPath, "doc.pdf");
    await service.saveAnnotations(filePath, {
      bookmarks: [{ id: "bm-1", pageNumber: 1, createdAt: 1 }],
      highlights: [],
    });

    await service.saveAnnotations(filePath, {
      bookmarks: [],
      highlights: [],
    });

    await expect(service.loadAnnotations(filePath)).resolves.toEqual({
      bookmarks: [],
      highlights: [],
    });
  });

  it("rejects files outside registered workspace roots", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    const workspaceRootPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-workspace-"),
    );
    const service = createService(userDataPath, workspaceRootPath);

    await expect(
      service.loadAnnotations(path.join(userDataPath, "outside.pdf")),
    ).rejects.toThrow("outside every registered workspace");
  });

  it("rejects non-PDF files", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    const workspaceRootPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-workspace-"),
    );
    const service = createService(userDataPath, workspaceRootPath);

    await expect(
      service.loadAnnotations(path.join(workspaceRootPath, "notes.txt")),
    ).rejects.toThrow("not a PDF");
  });
});
