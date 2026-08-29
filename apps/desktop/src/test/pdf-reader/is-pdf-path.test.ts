import { describe, expect, it } from "vitest";
import { isPdfPath } from "@/features/pdf-reader/is-pdf-path";

describe("isPdfPath", () => {
  it("matches .pdf regardless of case", () => {
    expect(isPdfPath("/a/b/report.pdf")).toBe(true);
    expect(isPdfPath("/a/b/REPORT.PDF")).toBe(true);
    expect(isPdfPath("file.Pdf")).toBe(true);
  });

  it("rejects non-pdf files", () => {
    expect(isPdfPath("/a/b/notes.txt")).toBe(false);
    expect(isPdfPath("/a/b/script.pdf.ts")).toBe(false);
    expect(isPdfPath("/a/b/pdf")).toBe(false);
    expect(isPdfPath("")).toBe(false);
  });
});
