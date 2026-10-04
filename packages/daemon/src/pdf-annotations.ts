import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyPdfAnnotationsOperation,
  EMPTY_DOCUMENT_ANNOTATIONS,
  normalizeDocumentAnnotations,
  type PdfAnnotationsOperation,
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
  private readonly queues = new Map<string, Promise<void>>();

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
    return this.enqueue(filePath, async () =>
      this.readStoredAnnotations(
        this.storageFilePathFor(await this.resolvePath(filePath)),
      ),
    );
  }

  // Mutations are applied to the stored document inside a per-path queue, so
  // concurrent clients never overwrite each other's marks with a stale
  // snapshot. The queue is entered synchronously: awaiting path resolution
  // first would let a later request whose awaits settle sooner jump ahead.
  async updateAnnotations(
    filePath: string,
    operation: PdfAnnotationsOperation,
  ): Promise<PdfDocumentAnnotations> {
    return this.enqueue(filePath, async () => {
      const resolvedPath = await this.resolvePath(filePath);
      const storagePath = this.storageFilePathFor(resolvedPath);
      const current = await this.readStoredAnnotations(storagePath);
      const next = normalizeDocumentAnnotations(
        applyPdfAnnotationsOperation(current, operation),
      );
      await this.persistAnnotations(resolvedPath, storagePath, next);
      return next;
    });
  }

  private async resolvePath(filePath: string): Promise<string> {
    return resolveAuthorizedPdfReadPath(
      filePath,
      await this.listWorkspaceRootPaths(),
    );
  }

  private async readStoredAnnotations(
    storagePath: string,
  ): Promise<PdfDocumentAnnotations> {
    try {
      const text = await readFile(storagePath, "utf8");
      return normalizeDocumentAnnotations(JSON.parse(text) as unknown);
    } catch (error) {
      if (isEnoent(error)) {
        return { ...EMPTY_DOCUMENT_ANNOTATIONS };
      }
      throw error;
    }
  }

  private async enqueue<T>(filePath: string, task: () => Promise<T>) {
    const run = (this.queues.get(filePath) ?? Promise.resolve()).then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(filePath, tail);
    try {
      return await run;
    } finally {
      if (this.queues.get(filePath) === tail) {
        this.queues.delete(filePath);
      }
    }
  }

  private async persistAnnotations(
    resolvedPath: string,
    storagePath: string,
    normalized: PdfDocumentAnnotations,
  ): Promise<void> {
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
