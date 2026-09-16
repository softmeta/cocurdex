import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  EMPTY_DOCUMENT_ANNOTATIONS,
  normalizeDocumentAnnotations,
  type PdfDocumentAnnotations,
} from "@cocurdex/shared";
import { resolveAuthorizedPdfReadPath } from "@cocurdex/shared/node";

const PDF_ANNOTATIONS_DIR = "pdf-annotations";
const STORAGE_VERSION = 1;

async function atomicWriteText(
  absolutePath: string,
  content: string,
): Promise<void> {
  const directory = path.dirname(absolutePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(temporaryPath, content, { encoding: "utf8" });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

// Absolute path → stable filename. Path is also stored inside the JSON so
// human inspection and future re-keying remain possible.
export function pdfAnnotationsStorageKey(filePath: string): string {
  return createHash("sha256").update(filePath).digest("hex");
}

interface StoredPdfAnnotationsFile {
  version: number;
  filePath: string;
  bookmarks: PdfDocumentAnnotations["bookmarks"];
  highlights: PdfDocumentAnnotations["highlights"];
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

export class DaemonPdfAnnotationsService {
  private readonly annotationsRootPath: string;
  private readonly saveChains = new Map<string, Promise<void>>();

  constructor(
    userDataPath: string,
    private readonly listWorkspaceRootPaths: () => Promise<string[]>,
  ) {
    this.annotationsRootPath = path.join(userDataPath, PDF_ANNOTATIONS_DIR);
  }

  private storageFilePathFor(filePath: string): string {
    return path.join(
      this.annotationsRootPath,
      `${pdfAnnotationsStorageKey(filePath)}.json`,
    );
  }

  async loadAnnotations(filePath: string): Promise<PdfDocumentAnnotations> {
    const resolvedPath = await resolveAuthorizedPdfReadPath(
      filePath,
      await this.listWorkspaceRootPaths(),
    );
    const storagePath = this.storageFilePathFor(resolvedPath);

    try {
      const text = await readFile(storagePath, "utf8");
      const parsed = JSON.parse(text) as unknown;
      return normalizeDocumentAnnotations(parsed);
    } catch (error) {
      if (isEnoent(error)) {
        return { ...EMPTY_DOCUMENT_ANNOTATIONS };
      }
      throw error;
    }
  }

  // Saves arrive as complete snapshots and callers do not await them, so
  // concurrent saves for one PDF must run in request order or an older
  // snapshot can overwrite a newer one. The chain is keyed by filePath and
  // entered synchronously: awaiting path resolution before enqueuing would
  // let a later save whose awaits settle first jump the queue.
  async saveAnnotations(
    filePath: string,
    annotations: PdfDocumentAnnotations,
  ): Promise<void> {
    const run = (this.saveChains.get(filePath) ?? Promise.resolve()).then(
      async () => {
        const resolvedPath = await resolveAuthorizedPdfReadPath(
          filePath,
          await this.listWorkspaceRootPaths(),
        );
        await this.persistAnnotations(
          resolvedPath,
          this.storageFilePathFor(resolvedPath),
          annotations,
        );
      },
    );
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.saveChains.set(filePath, tail);
    try {
      await run;
    } finally {
      if (this.saveChains.get(filePath) === tail) {
        this.saveChains.delete(filePath);
      }
    }
  }

  private async persistAnnotations(
    resolvedPath: string,
    storagePath: string,
    annotations: PdfDocumentAnnotations,
  ): Promise<void> {
    const normalized = normalizeDocumentAnnotations(annotations);

    if (
      normalized.bookmarks.length === 0 &&
      normalized.highlights.length === 0
    ) {
      try {
        await unlink(storagePath);
      } catch (error) {
        if (!isEnoent(error)) {
          throw error;
        }
      }
      return;
    }

    const payload: StoredPdfAnnotationsFile = {
      version: STORAGE_VERSION,
      filePath: resolvedPath,
      bookmarks: normalized.bookmarks,
      highlights: normalized.highlights,
    };

    await atomicWriteText(storagePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
}
