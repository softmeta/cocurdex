import type { SlideFrame } from "@cocurdex/shared";
import type PDFDocument from "pdfkit";
import {
  type DeckPaint,
  type DeckShape,
  type DeckTheme,
  type GradientStop,
  isGradient,
  type PatternDecoration,
  paintHex,
  type ShapeLine,
} from "./theme";

type Doc = InstanceType<typeof PDFDocument>;
type Gradient = ReturnType<Doc["linearGradient"]>;

export interface PdfShape {
  frame: SlideFrame;
  shape: DeckShape;
  fill?: DeckPaint;
  opacity?: number;
  radius?: number;
  rotate?: number;
  line?: ShapeLine;
}

const DASH_LENGTH = 4;

function addStops(
  gradient: Gradient,
  stops: GradientStop[],
  theme: DeckTheme,
  opacity: number,
) {
  for (const stop of stops) {
    gradient.stop(
      stop.at,
      `#${paintHex(theme, stop.color)}`,
      (stop.opacity ?? 1) * opacity,
    );
  }
  return gradient;
}

function tracePath(doc: Doc, shape: DeckShape, frame: SlideFrame, radius = 0) {
  const { x, y, w, h } = frame;
  if (shape === "ellipse") doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
  else if (shape === "roundRect") doc.roundedRect(x, y, w, h, radius);
  else doc.rect(x, y, w, h);
}

export function linearGradientLine(angle: number, frame: SlideFrame) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const half = (Math.abs(frame.w * dx) + Math.abs(frame.h * dy)) / 2;
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  return {
    x1: cx - dx * half,
    y1: cy - dy * half,
    x2: cx + dx * half,
    y2: cy + dy * half,
  };
}

export function insetForLine(frame: SlideFrame, line?: ShapeLine): SlideFrame {
  if (!line) return frame;
  const half = line.width / 2;
  return {
    x: frame.x + half,
    y: frame.y + half,
    w: Math.max(0, frame.w - line.width),
    h: Math.max(0, frame.h - line.width),
  };
}

export function fillPaint(
  doc: Doc,
  theme: DeckTheme,
  paint: DeckPaint,
  frame: SlideFrame,
  shape: DeckShape = "rect",
  opacity = 1,
  radius = 0,
) {
  doc.save();
  if (!isGradient(paint)) {
    tracePath(doc, shape, frame, radius);
    doc.fillOpacity(opacity).fill(`#${paintHex(theme, paint)}`);
  } else if (paint.kind === "linear") {
    const line = linearGradientLine(paint.angle, frame);
    const gradient = doc.linearGradient(line.x1, line.y1, line.x2, line.y2);
    tracePath(doc, shape, frame, radius);
    doc.fill(addStops(gradient, paint.stops, theme, opacity));
  } else {
    doc.translate(frame.x + frame.w / 2, frame.y + frame.h / 2);
    doc.scale(frame.w / 2, frame.h / 2);
    const gradient = doc.radialGradient(0, 0, 0, 0, 0, 1);
    if (shape === "ellipse") doc.circle(0, 0, 1);
    else doc.rect(-1, -1, 2, 2);
    doc.fill(addStops(gradient, paint.stops, theme, opacity));
  }
  doc.restore();
}

function strokeLine(
  doc: Doc,
  theme: DeckTheme,
  spec: PdfShape,
  line: ShapeLine,
  frame: SlideFrame,
) {
  doc.save();
  tracePath(doc, spec.shape, frame, spec.radius);
  doc.lineWidth(line.width);
  if (line.dashed) {
    doc.dash(line.width * DASH_LENGTH, { space: line.width * DASH_LENGTH });
  }
  doc
    .strokeOpacity((line.opacity ?? 1) * (spec.opacity ?? 1))
    .stroke(`#${paintHex(theme, line.color)}`);
  doc.restore();
}

export function drawPdfShape(doc: Doc, theme: DeckTheme, spec: PdfShape) {
  const frame = insetForLine(spec.frame, spec.line);
  doc.save();
  if (spec.rotate) {
    doc.rotate(spec.rotate, {
      origin: [
        spec.frame.x + spec.frame.w / 2,
        spec.frame.y + spec.frame.h / 2,
      ],
    });
  }
  if (spec.fill !== undefined) {
    fillPaint(
      doc,
      theme,
      spec.fill,
      frame,
      spec.shape,
      spec.opacity,
      spec.radius,
    );
  }
  if (spec.line) strokeLine(doc, theme, spec, spec.line, frame);
  doc.restore();
}

function patternOffsets(start: number, length: number, step: number) {
  const offsets: number[] = [];
  for (let at = 0; at < length; at += step) offsets.push(start + at);
  return offsets;
}

export function drawPdfPattern(
  doc: Doc,
  theme: DeckTheme,
  pattern: Omit<PatternDecoration, "kind">,
) {
  const { frame, spacing, size } = pattern;
  const color = `#${paintHex(theme, pattern.color)}`;
  doc.save();
  doc.rect(frame.x, frame.y, frame.w, frame.h).clip();
  const columns = patternOffsets(frame.x, frame.w, spacing);
  const rows = patternOffsets(frame.y, frame.h, spacing);
  if (pattern.pattern === "dots") {
    for (const y of rows) {
      for (const x of columns) {
        doc.circle(x + spacing / 2, y + spacing / 2, size);
      }
    }
  } else {
    if (pattern.pattern === "grid") {
      for (const x of columns) doc.rect(x, frame.y, size, frame.h);
    }
    for (const y of rows) doc.rect(frame.x, y, frame.w, size);
  }
  doc.fillOpacity(pattern.opacity).fill(color);
  doc.restore();
}
