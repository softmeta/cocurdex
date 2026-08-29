import { describe, expect, it } from "vitest";
import {
  filterSlashCommandItems,
  SLASH_COMMAND_ITEMS,
} from "@/components/markdown-body-editor";

describe("filterSlashCommandItems", () => {
  it("returns all items for an empty query", () => {
    expect(filterSlashCommandItems("")).toHaveLength(
      SLASH_COMMAND_ITEMS.length,
    );
    expect(filterSlashCommandItems("   ")).toHaveLength(
      SLASH_COMMAND_ITEMS.length,
    );
  });

  it("matches by key substring", () => {
    const keys = filterSlashCommandItems("head").map((i) => i.key);
    expect(keys).toEqual(["heading1", "heading2", "heading3"]);
  });

  it("matches by keyword", () => {
    const keys = filterSlashCommandItems("todo").map((i) => i.key);
    expect(keys).toEqual(["taskList"]);
  });

  it("is case-insensitive", () => {
    expect(filterSlashCommandItems("QUOTE").map((i) => i.key)).toEqual([
      "blockquote",
    ]);
  });

  it("returns nothing for an unmatched query", () => {
    expect(filterSlashCommandItems("zzz")).toEqual([]);
  });
});
