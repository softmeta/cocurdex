import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  EMPTY_DOCUMENT_ANNOTATIONS,
  normalizeDocumentAnnotations,
  type PdfDocumentAnnotations,
} from "@/features/pdf-reader/pdf-annotations";
import { atomicWriteText } from "./atomic-write";

const PDF_ANNOTATIONS_DIR = "pdf-annotations";
const STORAGE_VERSION = 1;

let annotationsRootPath = "";

export function initializePdfAnnotationsStorage(userDataPath: string) {
  annotationsRootPath = path.join(userDataPath, PDF_ANNOTATIONS_DIR);
}

export function getPdfAnnotationsStoragePath(userDataPath: string) {
  return path.join(userDataPath, PDF_ANNOTATIONS_DIR);
}

function requireAnnotationsRoot() {
  if (!annotationsRootPath) {
    throw new Error("PDF annotations storage is not initialized");
  }
  return annotationsRootPath;
}

// Absolute path → stable filename. Path is also stored inside the JSON so
// human inspection and future re-keying remain possible.
export function pdfAnnotationsStorageKey(filePath: string): string {
  return createHash("sha256").update(filePath).digest("hex");
}

function storageFilePathFor(filePath: string): string {
  const root = requireAnnotationsRoot();
  return path.join(root, `${pdfAnnotationsStorageKey(filePath)}.json`);
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

export async function loadPdfDocumentAnnotations(
  filePath: string,
): Promise<PdfDocumentAnnotations> {
  const resolvedPath = path.resolve(filePath);
  const storagePath = storageFilePathFor(resolvedPath);

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

export async function savePdfDocumentAnnotations(
  filePath: string,
  annotations: PdfDocumentAnnotations,
): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  const storagePath = storageFilePathFor(resolvedPath);
  const normalized = normalizeDocumentAnnotations(annotations);

  if (normalized.bookmarks.length === 0 && normalized.highlights.length === 0) {
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
