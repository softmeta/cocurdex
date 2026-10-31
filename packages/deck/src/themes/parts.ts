import type {
  DeckColor,
  SlideFrame,
  SlideLayoutId,
  TextRole,
} from "@cocurdex/shared";
import {
  BASE_ROLES,
  type CounterFormat,
  type DeckFont,
  type DeckPaint,
  type DeckPaintColor,
  type DeckTheme,
  type GradientStop,
  type LayoutStyle,
  type LinearGradient,
  type PageNumberDecoration,
  type PatternDecoration,
  type RadialGradient,
  type RoleTypography,
  type ShapeDecoration,
  type ShapeLine,
  type TextAlign,
  type TextDecoration,
} from "../theme";

type Stop = [color: DeckPaintColor, at: number, opacity?: number];

function stops(list: Stop[]): GradientStop[] {
  return list.map(([color, at, opacity]) => ({
    color,
    at,
    ...(opacity === undefined ? {} : { opacity }),
  }));
}

export function linear(angle: number, ...list: Stop[]): LinearGradient {
  return { kind: "linear", angle, stops: stops(list) };
}

export function radial(...list: Stop[]): RadialGradient {
  return { kind: "radial", stops: stops(list) };
}

export function glow(color: DeckPaintColor, strength: number): RadialGradient {
  return radial([color, 0, strength], [color, 1, 0]);
}

export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: DeckPaint,
  opacity?: number,
): ShapeDecoration {
  return {
    kind: "shape",
    shape: "rect",
    frame: { x, y, w, h },
    fill,
    ...(opacity === undefined ? {} : { opacity }),
  };
}

export function ellipse(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: DeckPaint,
  opacity?: number,
): ShapeDecoration {
  return { ...rect(x, y, w, h, fill, opacity), shape: "ellipse" };
}

export function roundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: DeckPaint,
  opacity?: number,
): ShapeDecoration {
  return { ...rect(x, y, w, h, fill, opacity), shape: "roundRect", radius };
}

export function line(
  color: DeckPaintColor,
  width: number,
  options: { opacity?: number; dashed?: boolean } = {},
): ShapeLine {
  return { color, width, ...options };
}

export function outlined(
  shape: ShapeDecoration,
  stroke: ShapeLine,
): ShapeDecoration {
  return { ...shape, line: stroke };
}

export function rotated(
  shape: ShapeDecoration,
  degrees: number,
): ShapeDecoration {
  return { ...shape, rotate: degrees };
}

export function ring(
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: ShapeLine,
): ShapeDecoration {
  return {
    kind: "shape",
    shape: "ellipse",
    frame: { x, y, w, h },
    line: stroke,
  };
}

export function box(
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: ShapeLine,
): ShapeDecoration {
  return { ...ring(x, y, w, h, stroke), shape: "rect" };
}

const FULL_SLIDE: SlideFrame = { x: 0, y: 0, w: 1280, h: 720 };

export function dots(
  spacing: number,
  size: number,
  color: DeckPaintColor,
  opacity: number,
): PatternDecoration {
  return {
    kind: "pattern",
    frame: FULL_SLIDE,
    pattern: "dots",
    spacing,
    size,
    color,
    opacity,
  };
}

export function rows(
  spacing: number,
  size: number,
  color: DeckPaintColor,
  opacity: number,
): PatternDecoration {
  return { ...dots(spacing, size, color, opacity), pattern: "rows" };
}

export function grid(
  spacing: number,
  size: number,
  color: DeckPaintColor,
  opacity: number,
): PatternDecoration {
  return { ...dots(spacing, size, color, opacity), pattern: "grid" };
}

type LabelStyle = Omit<TextDecoration, "kind" | "frame" | "text">;

export function label(
  frame: SlideFrame,
  text: string,
  style: LabelStyle,
): TextDecoration {
  return { kind: "text", frame, text, ...style };
}

export function sectionNumber(
  frame: SlideFrame,
  format: CounterFormat,
  style: LabelStyle,
): TextDecoration {
  return {
    kind: "text",
    frame,
    text: { counter: "section", format },
    ...style,
  };
}

const PAGE_NUMBER_FRAME: SlideFrame = { x: 1080, y: 664, w: 120, h: 32 };

export function pageNumber(
  color: DeckColor,
  font: DeckFont,
  placement: { frame: SlideFrame; align: TextAlign; size: number } = {
    frame: PAGE_NUMBER_FRAME,
    align: "right",
    size: 14,
  },
): PageNumberDecoration {
  return { kind: "pageNumber", color, font, ...placement };
}

type ContentLayoutId = Exclude<SlideLayoutId, "cover" | "closing" | "section">;

export function contentLayouts(
  content: LayoutStyle,
  blank: LayoutStyle,
): Record<ContentLayoutId, LayoutStyle> {
  return {
    "title-content": content,
    "two-content": content,
    "title-only": content,
    blank,
  };
}

export interface ThemeDefinition {
  colors: Record<DeckColor, string>;
  tableBorder: string;
  fonts?: DeckTheme["fonts"];
  roles?: Partial<Record<TextRole, Partial<RoleTypography>>>;
  layouts: Record<SlideLayoutId, LayoutStyle>;
}

export function defineTheme(definition: ThemeDefinition): DeckTheme {
  const roles = Object.fromEntries(
    Object.entries(BASE_ROLES).map(([role, base]) => [
      role,
      { ...base, ...definition.roles?.[role as TextRole] },
    ]),
  ) as Record<TextRole, RoleTypography>;
  return {
    colors: definition.colors,
    tableBorder: definition.tableBorder,
    fonts: definition.fonts ?? { heading: "sans", body: "sans" },
    roles,
    layouts: definition.layouts,
  };
}
