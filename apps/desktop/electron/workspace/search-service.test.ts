import { describe, expect, it } from "vitest";
import { getUtf16RangeFromByteOffsets } from "./search-service";

function byteOffset(text: string, marker: string) {
  return Buffer.byteLength(text.slice(0, text.indexOf(marker)), "utf8");
}

describe("getUtf16RangeFromByteOffsets", () => {
  it("converts ASCII byte offsets to 1-based UTF-16 columns", () => {
    const text = "hello world";
    const start = byteOffset(text, "world");
    const end = start + Buffer.byteLength("world", "utf8");

    expect(getUtf16RangeFromByteOffsets(Buffer.from(text), start, end)).toEqual(
      {
        endColumn: 12,
        startColumn: 7,
      },
    );
  });

  it("handles CJK characters before the match", () => {
    const text = "你好 search";
    const start = byteOffset(text, "search");
    const end = start + Buffer.byteLength("search", "utf8");

    expect(getUtf16RangeFromByteOffsets(Buffer.from(text), start, end)).toEqual(
      {
        endColumn: 10,
        startColumn: 4,
      },
    );
  });

  it("counts emoji as UTF-16 surrogate pairs", () => {
    const text = "a😀bc";
    const start = byteOffset(text, "b");
    const end = start + Buffer.byteLength("b", "utf8");

    expect(getUtf16RangeFromByteOffsets(Buffer.from(text), start, end)).toEqual(
      {
        endColumn: 5,
        startColumn: 4,
      },
    );
  });
});
