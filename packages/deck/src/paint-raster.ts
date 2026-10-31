import { deflateSync } from "node:zlib";
import type { SlideFrame } from "@cocurdex/shared";
import {
  type DeckGradient,
  type DeckTheme,
  type GradientStop,
  type PatternDecoration,
  paintHex,
} from "./theme";

const RASTER_LONG_SIDE = 256;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 4 + 1);
    rows[start] = 0;
    rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), start + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

type Rgba = [number, number, number, number];

function stopColor(theme: DeckTheme, stop: GradientStop): Rgba {
  const hex = paintHex(theme, stop.color);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    (stop.opacity ?? 1) * 255,
  ];
}

function sample(theme: DeckTheme, stops: GradientStop[], t: number): Rgba {
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return [0, 0, 0, 0];
  if (t <= first.at) return stopColor(theme, first);
  if (t >= last.at) return stopColor(theme, last);
  const nextIndex = sorted.findIndex((stop) => stop.at >= t);
  const from = sorted[nextIndex - 1] ?? first;
  const to = sorted[nextIndex] ?? last;
  const span = to.at - from.at || 1;
  const mix = (t - from.at) / span;
  const a = stopColor(theme, from);
  const b = stopColor(theme, to);
  return a.map((channel, index) => {
    const other = b[index] ?? channel;
    return channel + (other - channel) * mix;
  }) as Rgba;
}

function gradientPosition(
  gradient: DeckGradient,
  frame: SlideFrame,
  u: number,
  v: number,
): number {
  const dx = 2 * u - 1;
  const dy = 2 * v - 1;
  if (gradient.kind === "radial") return Math.hypot(dx, dy);
  const radians = (gradient.angle * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = -Math.cos(radians);
  const length = Math.abs(frame.w * sin) + Math.abs(frame.h * cos);
  const along = ((dx * frame.w) / 2) * sin + ((dy * frame.h) / 2) * cos;
  return along / length + 0.5;
}

export function rasterizeGradient(
  theme: DeckTheme,
  gradient: DeckGradient,
  frame: SlideFrame,
  shape: "rect" | "ellipse" = "rect",
  opacity = 1,
): { png: Buffer; width: number; height: number } {
  const scale = RASTER_LONG_SIDE / Math.max(frame.w, frame.h, 1);
  const width = Math.max(2, Math.round(frame.w * scale));
  const height = Math.max(2, Math.round(frame.h * scale));
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      const outside =
        shape === "ellipse" && (2 * u - 1) ** 2 + (2 * v - 1) ** 2 > 1;
      const t = gradientPosition(gradient, frame, u, v);
      const [r, g, b, a] = sample(theme, gradient.stops, t);
      const offset = (y * width + x) * 4;
      rgba[offset] = Math.round(r);
      rgba[offset + 1] = Math.round(g);
      rgba[offset + 2] = Math.round(b);
      rgba[offset + 3] = outside ? 0 : Math.round(a * opacity);
    }
  }
  return { png: encodeRgbaPng(width, height, rgba), width, height };
}

function patternCoverage(
  pattern: Omit<PatternDecoration, "kind">,
  x: number,
  y: number,
): number {
  const { spacing, size } = pattern;
  const localX = x - Math.floor(x / spacing) * spacing;
  const localY = y - Math.floor(y / spacing) * spacing;
  if (pattern.pattern === "rows") return localY < size ? 1 : 0;
  if (pattern.pattern === "grid") {
    return localX < size || localY < size ? 1 : 0;
  }
  const distance = Math.hypot(localX - spacing / 2, localY - spacing / 2);
  return Math.min(1, Math.max(0, size + 0.5 - distance));
}

export function rasterizePattern(
  theme: DeckTheme,
  pattern: Omit<PatternDecoration, "kind">,
): { png: Buffer; width: number; height: number } {
  const width = Math.max(1, Math.round(pattern.frame.w));
  const height = Math.max(1, Math.round(pattern.frame.h));
  const hex = paintHex(theme, pattern.color);
  const rgb = [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const coverage = patternCoverage(pattern, x + 0.5, y + 0.5);
      rgba.set(rgb, offset);
      rgba[offset + 3] = Math.round(coverage * pattern.opacity * 255);
    }
  }
  return { png: encodeRgbaPng(width, height, rgba), width, height };
}
