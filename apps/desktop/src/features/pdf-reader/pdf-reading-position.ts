// Per-document reading position helpers. Page numbers are 1-based to match
// pdf.js's public API (currentPageNumber / scrollPageIntoView). `top` / `left`
// are the in-page offsets pdf.js reports on `updateviewarea`, expressed in PDF
// user space, so a restored position is independent of zoom and panel width.

export interface PdfReadingPosition {
  page: number;
  top: number;
  left: number;
}

export type PdfReadingPositions = Record<string, PdfReadingPosition>;

export const PDF_DOCUMENT_START: PdfReadingPosition = {
  page: 1,
  top: 0,
  left: 0,
};

function toOffset(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeReadingPositions(value: unknown): PdfReadingPositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: PdfReadingPositions = {};
  for (const [path, entry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (path.length === 0) {
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const { page, top, left } = entry as Record<string, unknown>;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
      continue;
    }
    result[path] = { page, top: toOffset(top), left: toOffset(left) };
  }
  return result;
}

// Clamp a stored position into the document's page range. Falls back to the
// document start when nothing usable is stored (or the document is empty); an
// out-of-range page loses its in-page offset, which no longer means anything.
export function resolveRestoredPosition(
  saved: PdfReadingPosition | undefined,
  numPages: number,
): PdfReadingPosition {
  if (numPages < 1 || !saved) {
    return PDF_DOCUMENT_START;
  }
  const { page, top, left } = saved;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
    return PDF_DOCUMENT_START;
  }
  if (page > numPages) {
    return { page: numPages, top: 0, left: 0 };
  }
  return { page, top: toOffset(top), left: toOffset(left) };
}

export function normalizeOpenPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}
