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

  it("ignores code, link anchors, and numeric hashes", () => {
    expect(
      extractNoteMetadata(
        [
          "See [intro](#setup), issue #42, and `#inline`.",
          "```c",
          "#include <stdio.h>",
          "[[Not a link]]",
          "```",
          "Real #todo",
        ].join("\n"),
      ),
    ).toEqual({ tags: ["todo"], links: [] });
  });

  it("resolves wikilink aliases and headings to the note title", () => {
    expect(
      extractNoteMetadata("[[Paper|the paper]] and [[Paper#Results]]").links,
    ).toEqual([{ kind: "wikilink", targetRef: "Paper" }]);
  });
});
