import type {
  DeckColor,
  SlideFrame,
  SlideLayoutId,
  SlideSlotId,
  TextRole,
} from "@cocurdex/shared";

export interface RoleTypography {
  maxSize: number;
  minSize: number;
  bold: boolean;
  lineHeight: number;
}

export type DeckFont = "sans" | "serif" | "mono";
export type TextAlign = "left" | "center" | "right";
export type DeckPaintColor = DeckColor | `#${string}`;

export interface GradientStop {
  color: DeckPaintColor;
  at: number;
  opacity?: number;
}

export interface LinearGradient {
  kind: "linear";
  angle: number;
  stops: GradientStop[];
}

export interface RadialGradient {
  kind: "radial";
  stops: GradientStop[];
}

export type DeckGradient = LinearGradient | RadialGradient;
export type DeckPaint = DeckPaintColor | DeckGradient;

export type DeckShape = "rect" | "ellipse" | "roundRect";

export interface ShapeLine {
  color: DeckPaintColor;
  width: number;
  opacity?: number;
  dashed?: boolean;
}

export interface ShapeDecoration {
  kind: "shape";
  frame: SlideFrame;
  shape: DeckShape;
  fill?: DeckPaint;
  opacity?: number;
  radius?: number;
  rotate?: number;
  line?: ShapeLine;
}

export type CounterFormat = "decimal" | "padded" | "roman";

export interface DecorationCounter {
  counter: "page" | "section";
  format: CounterFormat;
}

export interface TextStroke {
  color: DeckColor;
  width: number;
  opacity?: number;
}

export interface TextDecoration {
  kind: "text";
  frame: SlideFrame;
  text: string | DecorationCounter;
  color: DeckColor;
  font: DeckFont;
  size: number;
  align: TextAlign;
  bold?: boolean;
  italic?: boolean;
  hollow?: boolean;
  stroke?: TextStroke;
}

export interface PatternDecoration {
  kind: "pattern";
  frame: SlideFrame;
  pattern: "dots" | "grid" | "rows";
  spacing: number;
  size: number;
  color: DeckPaintColor;
  opacity: number;
}

export interface PageNumberDecoration {
  kind: "pageNumber";
  frame: SlideFrame;
  color: DeckColor;
  font: DeckFont;
  size: number;
  align: TextAlign;
}

export type DecorationSpec =
  | ShapeDecoration
  | PageNumberDecoration
  | TextDecoration
  | PatternDecoration;

export interface SlotStyle {
  color?: DeckColor;
  align?: TextAlign;
  typography?: Partial<RoleTypography>;
}

export interface LayoutStyle {
  background: DeckPaint;
  decorations: DecorationSpec[];
  slots?: Partial<Record<SlideSlotId, SlotStyle>>;
}

export interface DeckTheme {
  colors: Record<DeckColor, string>;
  tableBorder: string;
  fonts: { heading: DeckFont; body: DeckFont };
  roles: Record<TextRole, RoleTypography>;
  layouts: Record<SlideLayoutId, LayoutStyle>;
}

export const FONT_FACES: Record<DeckFont, string> = {
  sans: "Arial",
  serif: "Georgia",
  mono: "Courier New",
};

export const BASE_ROLES: Record<TextRole, RoleTypography> = {
  title: { maxSize: 44, minSize: 28, bold: true, lineHeight: 1.15 },
  subtitle: { maxSize: 28, minSize: 18, bold: false, lineHeight: 1.3 },
  body: { maxSize: 28, minSize: 16, bold: false, lineHeight: 1.3 },
  caption: { maxSize: 18, minSize: 12, bold: false, lineHeight: 1.3 },
};

export function fontForRole(theme: DeckTheme, role: TextRole): DeckFont {
  return role === "title" ? theme.fonts.heading : theme.fonts.body;
}

export function isGradient(paint: DeckPaint): paint is DeckGradient {
  return typeof paint !== "string";
}

export function paintHex(theme: DeckTheme, color: DeckPaintColor): string {
  return color.startsWith("#")
    ? color.slice(1).toUpperCase()
    : theme.colors[color as DeckColor];
}

export function solidPaint(theme: DeckTheme, paint: DeckPaint): string {
  if (!isGradient(paint)) return paintHex(theme, paint);
  const first = paint.stops[0];
  return first ? paintHex(theme, first.color) : theme.colors.page;
}
