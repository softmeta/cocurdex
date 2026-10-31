import {
  entityLinkHref,
  entityLinkRef,
} from "@cocurdex/mobile/internal/markdown/entity-link";
import { describe, expect, it } from "vitest";

describe("entity links in markdown", () => {
  it("reads cocurdex:// links to issues, notes, and sessions", () => {
    expect(entityLinkRef("cocurdex://issue/issue-1")).toEqual({
      kind: "issue",
      id: "issue-1",
    });
    expect(entityLinkRef("cocurdex://note/n%201")).toEqual({
      kind: "note",
      id: "n 1",
    });
    expect(entityLinkRef("cocurdex://session/s1")).toEqual({
      kind: "session",
      id: "s1",
    });
  });

  it("reads note:// links the note editor writes", () => {
    expect(entityLinkRef("note://note-7")).toEqual({
      kind: "note",
      id: "note-7",
    });
  });

  it("leaves web links and unknown kinds to other handlers", () => {
    expect(entityLinkRef("https://example.invalid/issue/1")).toBeNull();
    expect(entityLinkRef("cocurdex://board/b1")).toBeNull();
  });

  it("opens each entity on the screen for its kind", () => {
    expect(entityLinkHref("h1", { kind: "issue", id: "i1" })).toEqual({
      pathname: "/issue/[hostId]/[issueId]",
      params: { hostId: "h1", issueId: "i1" },
    });
    expect(entityLinkHref("h1", { kind: "note", id: "n1" })?.pathname).toBe(
      "/note/[hostId]/[noteId]",
    );
    expect(entityLinkHref("h1", { kind: "deck", id: "d1" })).toBeNull();
  });
});
