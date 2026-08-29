// PDF selection → note citation helpers. Citations serialize as normal Markdown
// (plain excerpt + source link) so they round-trip through TipTap without a
// custom node. The link uses a private scheme so the note editor can intercept
// clicks and open the PDF reader without shelling out to the OS.

export const PDF_NOTE_CITATION_PROTOCOL = "cocurdex-pdf:";

export interface PdfNoteCitationTarget {
  filePath: string;
  pageNumber: number | null;
}

export interface BuildPdfNoteCitationInput extends PdfNoteCitationTarget {
  selectedText: string;
}

function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const last = segments[segments.length - 1] ?? "";
  return last.length > 0 ? last : filePath;
}

// Default title when auto-creating a note for a PDF selection clip.
export function noteTitleFromPdfPath(filePath: string): string {
  const fileName = fileNameFromPath(filePath);
  const withoutExt = fileName.replace(/\.pdf$/i, "").trim();
  return withoutExt.length > 0 ? withoutExt : fileName;
}

// Bracket content in [label](href) must not contain unescaped ] or newlines.
function escapeMarkdownLinkLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/\]/g, "\\]")
    .replace(/\r?\n/g, " ");
}

export function buildPdfNoteCitationHref(
  target: PdfNoteCitationTarget,
): string {
  const params = new URLSearchParams();
  params.set("path", target.filePath);
  if (
    typeof target.pageNumber === "number" &&
    Number.isInteger(target.pageNumber) &&
    target.pageNumber >= 1
  ) {
    params.set("page", String(target.pageNumber));
  }
  return `${PDF_NOTE_CITATION_PROTOCOL}//open?${params.toString()}`;
}

export function parsePdfNoteCitationHref(
  href: string | null | undefined,
): PdfNoteCitationTarget | null {
  if (typeof href !== "string" || href.length === 0) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== PDF_NOTE_CITATION_PROTOCOL) {
    return null;
  }
  const filePath = url.searchParams.get("path");
  if (!filePath || filePath.length === 0) {
    return null;
  }
  const pageRaw = url.searchParams.get("page");
  let pageNumber: number | null = null;
  if (pageRaw != null && pageRaw.length > 0) {
    const parsed = Number(pageRaw);
    if (Number.isInteger(parsed) && parsed >= 1) {
      pageNumber = parsed;
    }
  }
  return { filePath, pageNumber };
}

export function buildPdfNoteCitationMarkdown(
  input: BuildPdfNoteCitationInput,
): string | null {
  const selectedText = input.selectedText.replace(/\r\n/g, "\n").trim();
  if (!input.filePath || selectedText.length === 0) {
    return null;
  }

  const fileName = fileNameFromPath(input.filePath);
  const pageNumber =
    typeof input.pageNumber === "number" &&
    Number.isInteger(input.pageNumber) &&
    input.pageNumber >= 1
      ? input.pageNumber
      : null;

  const href = buildPdfNoteCitationHref({
    filePath: input.filePath,
    pageNumber,
  });
  const label = pageNumber != null ? `${fileName} · p.${pageNumber}` : fileName;

  // Plain paragraphs — not blockquotes — so clips read as normal note body text.
  return `${selectedText}\n\n— [${escapeMarkdownLinkLabel(label)}](${href})`;
}
