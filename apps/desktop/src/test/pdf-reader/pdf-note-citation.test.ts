import { describe, expect, it } from "vitest";
import {
  buildPdfNoteCitationHref,
  buildPdfNoteCitationMarkdown,
  noteTitleFromPdfPath,
  parsePdfNoteCitationHref,
} from "@/features/pdf-reader/pdf-note-citation";

describe("buildPdfNoteCitationHref / parsePdfNoteCitationHref", () => {
  it("round-trips absolute paths and page numbers", () => {
    const href = buildPdfNoteCitationHref({
      filePath: "/Users/me/papers/Paper One.pdf",
      pageNumber: 12,
    });
    expect(href.startsWith("cocurdex-pdf://open?")).toBe(true);
    expect(parsePdfNoteCitationHref(href)).toEqual({
      filePath: "/Users/me/papers/Paper One.pdf",
      pageNumber: 12,
    });
  });

  it("omits page when missing or invalid", () => {
    const href = buildPdfNoteCitationHref({
      filePath: "/tmp/a.pdf",
      pageNumber: null,
    });
    expect(parsePdfNoteCitationHref(href)).toEqual({
      filePath: "/tmp/a.pdf",
      pageNumber: null,
    });
    expect(
      parsePdfNoteCitationHref(
        buildPdfNoteCitationHref({ filePath: "/tmp/a.pdf", pageNumber: 0 }),
      ),
    ).toEqual({ filePath: "/tmp/a.pdf", pageNumber: null });
  });

  it("rejects non-citation hrefs", () => {
    expect(parsePdfNoteCitationHref("https://example.com")).toBeNull();
    expect(parsePdfNoteCitationHref("cocurdex-pdf://open")).toBeNull();
    expect(parsePdfNoteCitationHref(null)).toBeNull();
  });
});

describe("noteTitleFromPdfPath", () => {
  it("strips the .pdf extension for a note title", () => {
    expect(noteTitleFromPdfPath("/ws/docs/Guide.pdf")).toBe("Guide");
    expect(noteTitleFromPdfPath("plain.txt")).toBe("plain.txt");
  });
});

describe("buildPdfNoteCitationMarkdown", () => {
  it("builds plain excerpt text with a clickable source link", () => {
    const markdown = buildPdfNoteCitationMarkdown({
      filePath: "/ws/docs/guide.pdf",
      pageNumber: 3,
      selectedText: "Hello world",
    });
    expect(markdown).toBe(
      `Hello world\n\n— [guide.pdf · p.3](cocurdex-pdf://open?path=${encodeURIComponent("/ws/docs/guide.pdf")}&page=3)`,
    );
    expect(markdown).not.toContain("> ");
  });

  it("keeps multi-line selections as plain text", () => {
    const markdown = buildPdfNoteCitationMarkdown({
      filePath: "/ws/a.pdf",
      pageNumber: 1,
      selectedText: "line one\nline two",
    });
    expect(markdown).toContain("line one\nline two");
    expect(markdown).not.toMatch(/^>/m);
  });

  it("returns null for empty selection or path", () => {
    expect(
      buildPdfNoteCitationMarkdown({
        filePath: "",
        pageNumber: 1,
        selectedText: "x",
      }),
    ).toBeNull();
    expect(
      buildPdfNoteCitationMarkdown({
        filePath: "/a.pdf",
        pageNumber: 1,
        selectedText: "   ",
      }),
    ).toBeNull();
  });
});
