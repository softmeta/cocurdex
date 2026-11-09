import type { ContextFileAttachment } from "@cocurdex/shared";

const PDF_SELECTION_PLACEHOLDER_LINE = 1;

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
