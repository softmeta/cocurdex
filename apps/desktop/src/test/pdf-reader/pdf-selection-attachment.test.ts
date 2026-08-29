import { isContextFileAttachment } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { buildPdfSelectionAttachment } from "@/features/pdf-reader/pdf-selection-attachment";

describe("buildPdfSelectionAttachment", () => {
  it("builds a context-file attachment from selected PDF text", () => {
    const attachment = buildPdfSelectionAttachment(
      "/workspace/doc.pdf",
      "selected passage",
    );

    expect(isContextFileAttachment(attachment)).toBe(true);
    expect(attachment.filePath).toBe("/workspace/doc.pdf");
    expect(attachment.language).toBe("pdf");
    expect(attachment.selectedText).toBe("selected passage");
    // Selected text doubles as surrounding context for the MVP.
    expect(attachment.surroundingContext).toBe("selected passage");
  });

  it("uses placeholder line numbers (no line model for PDFs)", () => {
    const attachment = buildPdfSelectionAttachment("/x.pdf", "abc");
    expect(attachment.startLine).toBe(1);
    expect(attachment.endLine).toBe(1);
  });
});
