import { describe, expect, it } from "vitest";
import { extractNoteMetadata } from "./note-metadata";

describe("extractNoteMetadata", () => {
  it("extracts normalized tags and internal links from Markdown", () => {
    expect(
      extractNoteMetadata(`
# Storage

Use #SQLite and #数据库.
See [[Architecture]] and [Runtime](note://note-123).
      `),
    ).toEqual({
      tags: ["sqlite", "数据库"],
      links: [
        { kind: "wikilink", targetRef: "Architecture" },
        { kind: "markdown", targetRef: "note-123" },
      ],
    });
  });
});
