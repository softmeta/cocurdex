import { entityUri, parseEntityRef } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("entity refs", () => {
  it("round-trips through the cocurdex URI", () => {
    const ref = { kind: "note", id: "a b/c" } as const;
    expect(entityUri({ kind: "issue", id: "i1" })).toBe("cocurdex://issue/i1");
    expect(parseEntityRef(entityUri({ kind: "deck", id: "d1" }))).toEqual({
      kind: "deck",
      id: "d1",
    });
    expect(parseEntityRef(entityUri(ref))).toEqual(ref);
  });

  it("accepts kind:id shorthand, including issue identifiers", () => {
    expect(parseEntityRef(" issue:COC-12 ")).toEqual({
      kind: "issue",
      id: "COC-12",
    });
    expect(parseEntityRef("session:s1")).toEqual({ kind: "session", id: "s1" });
  });

  it("drops sentence punctuation a linkifier keeps after the link", () => {
    const id = "6e652ec8-20f9-4f1a-b45c-b211cc628ca1";
    for (const link of [
      `cocurdex://note/${id}。`,
      `cocurdex://note/${id}%E3%80%82`,
      `cocurdex://note/${id}），`,
      `cocurdex://note/${id}.`,
    ]) {
      expect(parseEntityRef(link)).toEqual({ kind: "note", id });
    }
    expect(parseEntityRef("cocurdex://note/。")).toBeNull();
  });

  it("rejects unknown kinds and empty or nested ids", () => {
    expect(parseEntityRef("file:readme")).toBeNull();
    expect(parseEntityRef("note:")).toBeNull();
    expect(parseEntityRef("cocurdex://note/a/b")).toBeNull();
    expect(parseEntityRef("cocurdex://note/%E0%A4%A")).toBeNull();
    expect(parseEntityRef("plain text")).toBeNull();
  });
});
