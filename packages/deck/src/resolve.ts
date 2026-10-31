import {
  type DeckColor,
  type DeckContent,
  type DeckImage,
  type FreeElement,
  SLIDE_SLOT_IDS,
  type Slide,
  type SlideFrame,
  type SlideLayoutId,
  type SlideSlotId,
  type SlotContent,
  type TableData,
  type TextParagraph,
  type TextRole,
} from "@cocurdex/shared";
import { SLIDE_LAYOUTS, type SlotSpec } from "./layouts";
import { fitTable, fitText } from "./text-fit";
import {
  type CounterFormat,
  type DeckFont,
  type DeckPaint,
  type DeckShape,
  type DeckTheme,
  type DecorationSpec,
  fontForRole,
  type PatternDecoration,
  type RoleTypography,
  type ShapeLine,
  type TextAlign,
  type TextStroke,
} from "./theme";
import { deckTheme } from "./themes";

export type ResolvedSource =
  | { kind: "slot"; slot: SlideSlotId }
  | { kind: "element"; elementId: string }
  | { kind: "decoration"; index: number };

export interface ResolvedText {
  kind: "text";
  source: ResolvedSource;
  frame: SlideFrame;
  paragraphs: TextParagraph[];
  role: TextRole;
  fontSize: number;
  color: DeckColor;
  font: DeckFont;
  bold: boolean;
  align: TextAlign;
  valign: "top" | "middle" | "bottom";
  lineHeight: number;
  overflow: boolean;
  italic?: boolean;
  hollow?: boolean;
  stroke?: TextStroke;
}

export interface ResolvedTable {
  kind: "table";
  source: ResolvedSource;
  frame: SlideFrame;
  table: TableData;
  fontSize: number;
  lineHeight: number;
  overflow: boolean;
}

export interface ResolvedShape {
  kind: "shape";
  source: ResolvedSource;
  frame: SlideFrame;
  shape: DeckShape;
  fill?: DeckPaint;
  opacity?: number;
  radius?: number;
  rotate?: number;
  line?: ShapeLine;
}

export interface ResolvedPattern
  extends Omit<PatternDecoration, "kind" | "frame"> {
  kind: "pattern";
  source: ResolvedSource;
  frame: SlideFrame;
}

export interface ResolvedImage {
  kind: "image";
  source: ResolvedSource;
  frame: SlideFrame;
  image: DeckImage;
  alt: string;
}

export type ResolvedItem =
  | ResolvedText
  | ResolvedTable
  | ResolvedShape
  | ResolvedImage
  | ResolvedPattern;

export interface ResolvedSlide {
  id: string;
  layout: SlideLayoutId;
  background: DeckPaint;
  items: ResolvedItem[];
  notes: string;
}

const TABLE_FONT = { max: 22, min: 10 };
const TABLE_LINE_HEIGHT = 1.25;

function typographyFor(
  theme: DeckTheme,
  spec: Pick<SlotSpec, "role" | "typography">,
): RoleTypography {
  return { ...theme.roles[spec.role], ...spec.typography };
}

function resolveText(
  source: ResolvedSource,
  frame: SlideFrame,
  paragraphs: TextParagraph[],
  spec: Omit<SlotSpec, "frame">,
  theme: DeckTheme,
): ResolvedText {
  const typography = typographyFor(theme, spec);
  const fit = fitText(
    paragraphs,
    frame,
    { max: typography.maxSize, min: typography.minSize },
    typography.lineHeight,
  );
  return {
    kind: "text",
    source,
    frame,
    paragraphs,
    role: spec.role,
    fontSize: fit.fontSize,
    color: spec.color,
    font: fontForRole(theme, spec.role),
    bold: typography.bold,
    align: spec.align,
    valign: spec.valign,
    lineHeight: typography.lineHeight,
    overflow: fit.overflow,
  };
}

function resolveTable(
  source: ResolvedSource,
  frame: SlideFrame,
  table: TableData,
): ResolvedTable {
  const fit = fitTable(table, frame, TABLE_FONT, TABLE_LINE_HEIGHT);
  return {
    kind: "table",
    source,
    frame,
    table,
    fontSize: fit.fontSize,
    lineHeight: TABLE_LINE_HEIGHT,
    overflow: fit.overflow,
  };
}

function resolveSlot(
  slot: SlideSlotId,
  content: SlotContent,
  spec: SlotSpec,
  frame: SlideFrame,
  theme: DeckTheme,
): ResolvedItem {
  const source: ResolvedSource = { kind: "slot", slot };
  if (content.kind === "table") {
    return resolveTable(source, frame, content.table);
  }
  return resolveText(source, frame, content.paragraphs, spec, theme);
}

const FREE_TEXT_SPEC: Record<TextRole, Omit<SlotSpec, "frame">> = {
  title: { role: "title", color: "text", align: "left", valign: "top" },
  subtitle: { role: "subtitle", color: "muted", align: "left", valign: "top" },
  body: { role: "body", color: "text", align: "left", valign: "top" },
  caption: { role: "caption", color: "muted", align: "left", valign: "top" },
};

function resolveElement(element: FreeElement, theme: DeckTheme): ResolvedItem {
  const source: ResolvedSource = { kind: "element", elementId: element.id };
  switch (element.kind) {
    case "text":
      return resolveText(
        source,
        element.frame,
        element.paragraphs,
        FREE_TEXT_SPEC[element.role],
        theme,
      );
    case "table":
      return resolveTable(source, element.frame, element.table);
    case "shape":
      return {
        kind: "shape",
        source,
        frame: element.frame,
        shape: element.shape,
        fill: element.fill,
      };
    case "image":
      return {
        kind: "image",
        source,
        frame: containFrame(element.frame, element.image),
        image: element.image,
        alt: element.alt ?? "",
      };
  }
}

export function containFrame(
  box: SlideFrame,
  size: { width: number; height: number },
): SlideFrame {
  const scale = Math.min(box.w / size.width, box.h / size.height);
  const w = size.width * scale;
  const h = size.height * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

export function themedSlotSpec(
  theme: DeckTheme,
  layout: SlideLayoutId,
  slot: SlideSlotId,
): SlotSpec | undefined {
  const base = SLIDE_LAYOUTS[layout].slots[slot];
  if (!base) return undefined;
  const style = theme.layouts[layout].slots?.[slot];
  if (!style) return base;
  return {
    ...base,
    ...(style.color ? { color: style.color } : {}),
    ...(style.align ? { align: style.align } : {}),
    typography: { ...base.typography, ...style.typography },
  };
}

interface DecorationCounters {
  page: number;
  section: number;
}

const ROMAN_DIGITS: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function romanNumeral(value: number): string {
  let rest = value;
  let result = "";
  for (const [amount, digits] of ROMAN_DIGITS) {
    while (rest >= amount) {
      result += digits;
      rest -= amount;
    }
  }
  return result;
}

export function formatCounter(value: number, format: CounterFormat): string {
  if (format === "roman") return romanNumeral(value);
  if (format === "padded") return String(value).padStart(2, "0");
  return String(value);
}

function decorationText(
  decoration: Extract<DecorationSpec, { kind: "text" | "pageNumber" }>,
  counters: DecorationCounters,
): string {
  if (decoration.kind === "pageNumber") return String(counters.page);
  if (typeof decoration.text === "string") return decoration.text;
  const value = counters[decoration.text.counter];
  return formatCounter(value, decoration.text.format);
}

function resolveDecoration(
  decoration: DecorationSpec,
  index: number,
  counters: DecorationCounters,
  theme: DeckTheme,
): ResolvedItem {
  const source: ResolvedSource = { kind: "decoration", index };
  if (decoration.kind === "shape") {
    const { kind: _kind, ...shape } = decoration;
    return { kind: "shape", source, ...shape };
  }
  if (decoration.kind === "pattern") {
    const { kind: _kind, ...pattern } = decoration;
    return { kind: "pattern", source, ...pattern };
  }
  const label = decoration.kind === "text" ? decoration : undefined;
  return {
    kind: "text",
    source,
    frame: decoration.frame,
    paragraphs: [{ runs: [{ text: decorationText(decoration, counters) }] }],
    role: "caption",
    fontSize: decoration.size,
    color: decoration.color,
    font: decoration.font,
    bold: label?.bold ?? false,
    align: decoration.align,
    valign: "middle",
    lineHeight: label ? 1 : theme.roles.caption.lineHeight,
    overflow: false,
    ...(label?.italic ? { italic: true } : {}),
    ...(label?.hollow ? { hollow: true } : {}),
    ...(label?.stroke ? { stroke: label.stroke } : {}),
  };
}

function decorationCounters(slide: Slide, deck: DeckContent) {
  const index = deck.slides.findIndex((item) => item.id === slide.id);
  const section = deck.slides
    .slice(0, index + 1)
    .filter((item) => item.layout === "section").length;
  return { page: index + 1, section };
}

export function resolveEmptySlots(
  slide: Slide,
  deck: DeckContent,
): ResolvedText[] {
  const theme = deckTheme(deck.theme);
  return SLIDE_SLOT_IDS.flatMap((slot) => {
    const spec = themedSlotSpec(theme, slide.layout, slot);
    if (slide.slots[slot] || !spec) return [];
    const frame = slide.slotFrames?.[slot] ?? spec.frame;
    return [resolveText({ kind: "slot", slot }, frame, [], spec, theme)];
  });
}

export function resolveSlide(slide: Slide, deck: DeckContent): ResolvedSlide {
  const theme = deckTheme(deck.theme);
  const style = theme.layouts[slide.layout];
  const counters = decorationCounters(slide, deck);
  const items: ResolvedItem[] = style.decorations.map((decoration, index) =>
    resolveDecoration(decoration, index, counters, theme),
  );
  for (const slot of SLIDE_SLOT_IDS) {
    const content = slide.slots[slot];
    const spec = themedSlotSpec(theme, slide.layout, slot);
    if (!content || !spec) continue;
    const frame = slide.slotFrames?.[slot] ?? spec.frame;
    items.push(resolveSlot(slot, content, spec, frame, theme));
  }
  for (const element of slide.elements) {
    items.push(resolveElement(element, theme));
  }
  return {
    id: slide.id,
    layout: slide.layout,
    background: style.background,
    items,
    notes: slide.notes,
  };
}
