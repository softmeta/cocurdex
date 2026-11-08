export type {
  PdfAnnotationsByPath,
  PdfAnnotationsOperation,
  PdfDocumentAnnotations,
  PdfHighlight,
  PdfHighlightColor,
  PdfQuad,
  PdfUserBookmark,
} from "@cocurdex/shared";
export {
  applyPdfAnnotationsOperation,
  createBookmark,
  createHighlight,
  EMPTY_DOCUMENT_ANNOTATIONS,
  findBookmarkForPage,
  getDocumentAnnotations,
  isPdfHighlightColor,
  normalizeAnnotationsByPath,
  normalizeDocumentAnnotations,
  PDF_HIGHLIGHT_COLORS,
  setDocumentAnnotations,
} from "@cocurdex/shared";
