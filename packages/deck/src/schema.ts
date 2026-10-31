import {
  DECK_COLORS,
  DECK_CONTENT_VERSION,
  DECK_IMAGE_MIME_TYPES,
  DECK_THEME_IDS,
  type DeckContent,
  type DeckOp,
  SLIDE_LAYOUT_IDS,
  SLIDE_SLOT_IDS,
} from "@cocurdex/shared";
import { z } from "zod";

export const DECK_LIMITS = {
  slides: 500,
  elements: 200,
  text: 20_000,
  paragraphs: 200,
  runs: 500,
  tableRows: 50,
  tableColumns: 20,
} as const;

const MAX_SLIDES = DECK_LIMITS.slides;
const MAX_ELEMENTS = DECK_LIMITS.elements;
const MAX_TEXT = DECK_LIMITS.text;
const MAX_LEVEL = 4;
const MAX_OPS = 500;
const MAX_MARKDOWN = 2_000_000;

const idSchema = z.string().min(1).max(128);
const colorSchema = z.enum(DECK_COLORS);
const coordinateSchema = z.number().finite().min(-10_000).max(10_000);

const frameSchema = z.object({
  x: coordinateSchema,
  y: coordinateSchema,
  w: z.number().finite().positive().max(10_000),
  h: z.number().finite().positive().max(10_000),
});

const runSchema = z.object({
  text: z.string().max(MAX_TEXT),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  code: z.boolean().optional(),
  link: z.string().url().max(2048).optional(),
  color: colorSchema.optional(),
});

const paragraphSchema = z.object({
  runs: z.array(runSchema).max(DECK_LIMITS.runs),
  list: z.enum(["bullet", "number"]).optional(),
  level: z.number().int().min(0).max(MAX_LEVEL).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
});

const paragraphsSchema = z.array(paragraphSchema).max(DECK_LIMITS.paragraphs);

const tableSchema = z.object({
  header: z.boolean(),
  rows: z
    .array(
      z
        .array(z.object({ paragraphs: paragraphsSchema }))
        .min(1)
        .max(DECK_LIMITS.tableColumns),
    )
    .min(1)
    .max(DECK_LIMITS.tableRows),
});

const slotContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), paragraphs: paragraphsSchema }),
  z.object({ kind: z.literal("table"), table: tableSchema }),
]);

const imageSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  mimeType: z.enum(DECK_IMAGE_MIME_TYPES),
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
});

const altSchema = z.string().max(1_000);

const elementSchema = z.discriminatedUnion("kind", [
  z.object({
    id: idSchema,
    kind: z.literal("text"),
    frame: frameSchema,
    role: z.enum(["title", "subtitle", "body", "caption"]),
    paragraphs: paragraphsSchema,
  }),
  z.object({
    id: idSchema,
    kind: z.literal("shape"),
    frame: frameSchema,
    shape: z.enum(["rect", "ellipse"]),
    fill: colorSchema,
  }),
  z.object({
    id: idSchema,
    kind: z.literal("table"),
    frame: frameSchema,
    table: tableSchema,
  }),
  z.object({
    id: idSchema,
    kind: z.literal("image"),
    frame: frameSchema,
    image: imageSchema,
    alt: altSchema.optional(),
  }),
]);

const slotIdSchema = z.enum(SLIDE_SLOT_IDS);

const slideSchema = z.object({
  id: idSchema,
  layout: z.enum(SLIDE_LAYOUT_IDS),
  slots: z.partialRecord(slotIdSchema, slotContentSchema),
  slotFrames: z.partialRecord(slotIdSchema, frameSchema).optional(),
  elements: z.array(elementSchema).max(MAX_ELEMENTS),
  notes: z.string().max(MAX_TEXT),
});

export const deckContentSchema = z.object({
  version: z.literal(DECK_CONTENT_VERSION),
  size: z.object({
    width: z.literal(1280),
    height: z.literal(720),
  }),
  theme: z.enum(DECK_THEME_IDS),
  slides: z.array(slideSchema).max(MAX_SLIDES),
}) satisfies z.ZodType<DeckContent>;

export function parseDeckContent(value: unknown): DeckContent {
  return deckContentSchema.parse(value);
}

const slideIdSchema = z.object({ slideId: idSchema });
const indexSchema = z.number().int();
const layoutSchema = z.enum(SLIDE_LAYOUT_IDS);
const textTargetSchema = z.union([
  z.templateLiteral(["slot:", slotIdSchema]),
  z.templateLiteral(["element:", idSchema]),
]);
const setTextSchema = slideIdSchema.extend({
  op: z.literal("setText"),
  target: textTargetSchema,
});
export const deckOpSchema = z.union([
  z.object({
    op: z.literal("addSlide"),
    layout: layoutSchema,
    index: indexSchema.optional(),
  }),
  z.object({
    op: z.literal("insertSlides"),
    markdown: z.string().max(MAX_MARKDOWN),
    index: indexSchema.optional(),
  }),
  slideIdSchema.extend({ op: z.literal("duplicateSlide") }),
  slideIdSchema.extend({ op: z.literal("deleteSlide") }),
  slideIdSchema.extend({ op: z.literal("moveSlide"), index: indexSchema }),
  slideIdSchema.extend({ op: z.literal("setLayout"), layout: layoutSchema }),
  setTextSchema.extend({
    paragraphs: paragraphsSchema,
    markdown: z.undefined().optional(),
  }),
  setTextSchema.extend({
    markdown: z.string().max(MAX_TEXT),
    paragraphs: z.undefined().optional(),
  }),
  slideIdSchema.extend({
    op: z.literal("setNotes"),
    notes: z.string().max(MAX_TEXT),
  }),
  z.object({ op: z.literal("setTheme"), theme: z.enum(DECK_THEME_IDS) }),
  slideIdSchema.extend({
    op: z.literal("addImage"),
    image: imageSchema,
    frame: frameSchema.optional(),
    alt: altSchema.optional(),
  }),
  slideIdSchema.extend({
    op: z.literal("setImage"),
    elementId: idSchema,
    image: imageSchema,
  }),
  slideIdSchema.extend({
    op: z.literal("deleteElement"),
    elementId: idSchema,
  }),
]) satisfies z.ZodType<DeckOp>;

export const deckOpsSchema = z.array(deckOpSchema).min(1).max(MAX_OPS);
