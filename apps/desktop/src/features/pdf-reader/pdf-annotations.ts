// PDF annotation types and normalization live in @cocurdex/shared so the
// daemon can persist annotations for non-Electron clients.

export type {
  PdfAnnotationsByPath,
  PdfDocumentAnnotations,
  PdfHighlight,
  PdfHighlightColor,
  PdfQuad,
  PdfUserBookmark,
} from "@cocurdex/shared";
export {
  addBookmarkToDocument,
  addHighlightToDocument,
  createBookmark,
  createHighlight,
  EMPTY_DOCUMENT_ANNOTATIONS,
  findBookmarkForPage,
  getDocumentAnnotations,
  isPdfHighlightColor,
  normalizeAnnotationsByPath,
  normalizeDocumentAnnotations,
  PDF_HIGHLIGHT_COLORS,
  removeBookmarkForPage,
  removeBookmarkFromDocument,
  removeHighlightFromDocument,
  setDocumentAnnotations,
} from "@cocurdex/shared";
