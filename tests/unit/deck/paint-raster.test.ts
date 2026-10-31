import { inflateSync } from "node:zlib";
import { DECK_THEMES } from "@cocurdex/deck";
import {
  rasterizeGradient,
  rasterizePattern,
} from "@cocurdex/deck/internal/paint-raster";
import { splitCjk } from "@cocurdex/deck/internal/script-segments";
import { describe, expect, it } from "vitest";

function decodeRgba(png: Buffer) {
  const width = png.readUInt32BE(16);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT")
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks));
  return (x: number, y: number) => {
    const start = y * (width * 4 + 1) + 1 + x * 4;
    return [...rows.subarray(start, start + 4)];
  };
}

const theme = DECK_THEMES.default;

describe("rasterizeGradient", () => {
  it("runs a 90 degree linear gradient from left to right", () => {
    const { png, width, height } = rasterizeGradient(
      theme,
      {
        kind: "linear",
        angle: 90,
        stops: [
          { color: "#000000", at: 0 },
          { color: "#FFFFFF", at: 1 },
        ],
      },
      { x: 0, y: 0, w: 1280, h: 720 },
    );
    const pixel = decodeRgba(png);
    const middle = Math.floor(height / 2);

    expect(width).toBe(256);
    expect(height).toBe(144);
    expect(pixel(0, middle)[0]).toBeLessThan(5);
    expect(pixel(width - 1, middle)[0]).toBeGreaterThan(250);
    expect(pixel(0, 0)[0]).toBe(pixel(0, height - 1)[0]);
  });

  it("fades a radial glow to transparent and masks ellipse corners", () => {
    const { png, width } = rasterizeGradient(
      theme,
      {
        kind: "radial",
        stops: [
          { color: "accent", at: 0, opacity: 0.5 },
          { color: "accent", at: 1, opacity: 0 },
        ],
      },
      { x: 0, y: 0, w: 400, h: 400 },
      "ellipse",
    );
    const pixel = decodeRgba(png);
    const center = Math.floor(width / 2);

    expect(pixel(center, center)[3]).toBeGreaterThan(120);
    expect(pixel(center, center).slice(0, 3)).toEqual([0x25, 0x63, 0xeb]);
    expect(pixel(0, 0)[3]).toBe(0);
  });
});

describe("rasterizePattern", () => {
  const frame = { x: 0, y: 0, w: 64, h: 32 };

  it("centers one dot per tile and leaves the gaps transparent", () => {
    const { png } = rasterizePattern(theme, {
      frame,
      pattern: "dots",
      spacing: 16,
      size: 2,
      color: "#000000",
      opacity: 0.5,
    });
    const pixel = decodeRgba(png);

    expect(pixel(8, 8)[3]).toBe(128);
    expect(pixel(24, 24)[3]).toBe(128);
    expect(pixel(0, 0)[3]).toBe(0);
  });

  it("draws grid lines on both axes but rows only horizontally", () => {
    const grid = decodeRgba(
      rasterizePattern(theme, {
        frame,
        pattern: "grid",
        spacing: 16,
        size: 1,
        color: "#FFFFFF",
        opacity: 1,
      }).png,
    );
    const rows = decodeRgba(
      rasterizePattern(theme, {
        frame,
        pattern: "rows",
        spacing: 16,
        size: 1,
        color: "#FFFFFF",
        opacity: 1,
      }).png,
    );

    expect(grid(16, 8)[3]).toBe(255);
    expect(grid(8, 16)[3]).toBe(255);
    expect(grid(8, 8)[3]).toBe(0);
    expect(rows(8, 16)[3]).toBe(255);
    expect(rows(16, 8)[3]).toBe(0);
  });
});

describe("splitCjk", () => {
  it("separates CJK runs from Latin text so each gets a covering font", () => {
    expect(splitCjk("Q3 结账评审 review")).toEqual([
      { text: "Q3 ", cjk: false },
      { text: "结账评审", cjk: true },
      { text: " review", cjk: false },
    ]);
  });
});
