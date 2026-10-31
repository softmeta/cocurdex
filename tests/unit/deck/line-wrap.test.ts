import { lineWidth, wrapPieces } from "@cocurdex/deck/internal/line-wrap";
import { describe, expect, it } from "vitest";

interface Piece {
  text: string;
  font: string;
}

const measure = (piece: Piece) => [...piece.text].length * 10;

function texts(lines: { text: string; font: string }[][]) {
  return lines.map((line) =>
    line.map((piece) => `${piece.font}:${piece.text}`),
  );
}

describe("wrapPieces", () => {
  it("keeps mixed-script runs on one line with their own widths", () => {
    const pieces = [
      { text: "平台团队 · ", font: "cjk" },
      { text: "2026", font: "serif" },
      { text: " 年 ", font: "cjk" },
    ];
    const lines = wrapPieces(pieces, measure, 1000);
    expect(texts(lines)).toEqual([
      ["cjk:平台团队 · ", "serif:2026", "cjk: 年 "],
    ]);
    expect(lines[0].map((piece) => piece.width)).toEqual([70, 40, 30]);
  });

  it("breaks Latin text between words and CJK text between characters", () => {
    const latin = wrapPieces(
      [{ text: "alpha beta gamma", font: "a" }],
      measure,
      110,
    );
    expect(texts(latin)).toEqual([["a:alpha beta "], ["a:gamma"]]);
    const cjk = wrapPieces([{ text: "一二三四五", font: "c" }], measure, 30);
    expect(texts(cjk)).toEqual([["c:一二三"], ["c:四五"]]);
  });

  it("measures a line without its trailing spaces", () => {
    const [line] = wrapPieces([{ text: "ab  ", font: "a" }], measure, 100);
    expect(lineWidth(line, measure)).toBe(20);
  });
});
