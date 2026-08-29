import type { ContextFileAttachment } from "@cocurdex/shared";

// PDF selections have no line numbers — pdf.js exposes a text layer, not a line
// model. The MVP reuses ContextFileAttachment (zero adapter changes) with
// placeholder line numbers. Centralizing the placeholder here means swapping in
// structured page-number attachments later touches exactly one function.
const PDF_SELECTION_PLACEHOLDER_LINE = 1;

// Build a chat context attachment from PDF text the user selected in the
// viewer. Selected text doubles as the surrounding context (the text layer has
// no cheap notion of "nearby lines"), and the language tag marks the source.
export function buildPdfSelectionAttachment(
  filePath: string,
  selectedText: string,
): ContextFileAttachment {
  return {
    endLine: PDF_SELECTION_PLACEHOLDER_LINE,
    filePath,
    language: "pdf",
    selectedText,
    startLine: PDF_SELECTION_PLACEHOLDER_LINE,
    surroundingContext: selectedText,
  };
}
