import { describe, expect, it } from "vitest";
import { getFileTypeIconAttributes } from "./file-type-icon";

describe("getFileTypeIconAttributes", () => {
  it("reuses the file tree's brand glyph for .astro files", () => {
    const { symbolId, color } = getFileTypeIconAttributes("src/Hero.astro");
    expect(symbolId).toBe("file-tree-builtin-astro");
    expect(color).toBeDefined();
  });

  it("resolves common languages to their brand glyphs", () => {
    expect(getFileTypeIconAttributes("a.ts").symbolId).toBe(
      "file-tree-builtin-typescript",
    );
    expect(getFileTypeIconAttributes("a.tsx").symbolId).toBe(
      "file-tree-builtin-react",
    );
    expect(getFileTypeIconAttributes("pkg/data.json").symbolId).toBe(
      "file-tree-builtin-json",
    );
  });

  it("resolves by exact file name, not just extension", () => {
    expect(getFileTypeIconAttributes("Dockerfile").symbolId).toBe(
      "file-tree-builtin-docker",
    );
  });

  it("falls back to the default glyph for unknown extensions", () => {
    const { symbolId, color } = getFileTypeIconAttributes("notes.unknownext");
    expect(symbolId).toBe("file-tree-builtin-default");
    expect(color).toBeDefined();
  });
});
