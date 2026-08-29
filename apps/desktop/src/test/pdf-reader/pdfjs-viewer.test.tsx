import { describe, expect, it } from "vitest";
import source from "../../../src/features/pdf-reader/renderer/pdfjs-viewer.tsx?raw";

describe("PdfJsViewer", () => {
  it("does not call useEffect directly", () => {
    expect(source).not.toMatch(/\buseEffect\s*\(/);
  });

  it("restores the saved position on pagesinit", () => {
    expect(source).toMatch(/resolveRestoredPosition/);
    expect(source).toMatch(/scrollToPosition\(pdfViewer, restored\)/);
  });
});
