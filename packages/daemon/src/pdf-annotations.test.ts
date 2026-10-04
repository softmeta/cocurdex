import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
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

    await service.updateAnnotations(filePath, {
      type: "merge",
      annotations,
    });

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
    await service.updateAnnotations(filePath, {
      type: "addBookmark",
      bookmark: { id: "bm-1", pageNumber: 1, createdAt: 1 },
    });

    await service.updateAnnotations(filePath, {
      type: "removeBookmark",
      bookmarkId: "bm-1",
    });
    await expect(
      readFile(
        path.join(
          userDataPath,
          "pdf-annotations",
          `${pdfAnnotationsStorageKey(path.resolve(filePath))}.json`,
        ),
      ),
    ).rejects.toThrow("ENOENT");

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

  it("keeps every concurrent mutation instead of the last snapshot", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    const workspaceRootPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-workspace-"),
    );
    const service = createService(userDataPath, workspaceRootPath);
    const filePath = path.join(workspaceRootPath, "doc.pdf");
    const highlight = (id: string) => ({
      id,
      pageNumber: 1,
      color: "yellow" as const,
      selectedText: id,
      quads: [{ x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.12 }],
      createdAt: 1,
    });

    await service.updateAnnotations(filePath, {
      type: "addHighlight",
      highlight: highlight("existing"),
    });
    const results = await Promise.all([
      service.updateAnnotations(filePath, {
        type: "addHighlight",
        highlight: highlight("window-a"),
      }),
      service.updateAnnotations(filePath, {
        type: "addBookmark",
        bookmark: { id: "bm-b", pageNumber: 2, createdAt: 2 },
      }),
      service.loadAnnotations(filePath),
    ]);

    const loaded = await service.loadAnnotations(filePath);
    expect(loaded.highlights.map((entry) => entry.id)).toEqual([
      "existing",
      "window-a",
    ]);
    expect(loaded.bookmarks.map((entry) => entry.id)).toEqual(["bm-b"]);
    expect(results[2]).toEqual(loaded);
  });

  it("rejects a PDF that reaches outside the workspace via symlink", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    const workspaceRootPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-workspace-"),
    );
    const outsideDir = await mkdtemp(path.join(tmpdir(), "cocurdex-outside-"));
    await writeFile(path.join(outsideDir, "secret.pdf"), "%PDF-1.4\n", "utf8");
    await symlink(outsideDir, path.join(workspaceRootPath, "linked"), "dir");
    const service = createService(userDataPath, workspaceRootPath);

    await expect(
      service.loadAnnotations(
        path.join(workspaceRootPath, "linked", "secret.pdf"),
      ),
    ).rejects.toThrow("outside every registered workspace");
  });

  it("accepts a file when the workspace root itself is a symlink", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-annotations-"),
    );
    const realRoot = await mkdtemp(
      path.join(tmpdir(), "cocurdex-pdf-workspace-"),
    );
    const linkedRoot = path.join(
      await mkdtemp(path.join(tmpdir(), "cocurdex-link-")),
      "root",
    );
    await symlink(realRoot, linkedRoot, "dir");
    await mkdir(path.join(realRoot, "papers"), { recursive: true });
    const filePath = path.join(linkedRoot, "papers", "paper.pdf");
    await writeFile(path.join(realRoot, "papers", "paper.pdf"), "%PDF", "utf8");
    const service = createService(userDataPath, linkedRoot);

    await service.updateAnnotations(filePath, {
      type: "addBookmark",
      bookmark: { id: "bm-1", pageNumber: 1, createdAt: 1 },
    });
    await expect(service.loadAnnotations(filePath)).resolves.toEqual({
      bookmarks: [{ id: "bm-1", pageNumber: 1, createdAt: 1 }],
      highlights: [],
    });

    const storagePath = path.join(
      userDataPath,
      "pdf-annotations",
      `${pdfAnnotationsStorageKey(path.resolve(filePath))}.json`,
    );
    const onDisk = JSON.parse(await readFile(storagePath, "utf8")) as {
      filePath: string;
    };
    expect(onDisk.filePath).toBe(path.resolve(filePath));
  });
});
