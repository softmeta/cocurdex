import {
  DECK_CONTENT_VERSION,
  DEFAULT_SLIDE_SIZE,
  type DeckCompileWarning,
  type DeckContent,
  type DeckImage,
  type FreeElement,
  type Slide,
  type SlideFrame,
  type SlideLayoutId,
  type SlideSlotId,
  type TableData,
  type TextParagraph,
  type TextRole,
} from "@cocurdex/shared";
import type { IdFactory } from "./markdown";
import type { EmuFrame, PptxDocument, PptxItem, PptxSlide } from "./pptx-read";
import { DECK_LIMITS, parseDeckContent } from "./schema";

export type PptxImageStore = (bytes: Buffer) => Promise<DeckImage | null>;

export interface PptxImportResult {
  content: DeckContent;
  title: string | null;
  warnings: DeckCompileWarning[];
}

type TextItem = Extract<PptxItem, { kind: "text" }>;

interface SlotPlan {
  layout: SlideLayoutId;
  slots: Partial<Record<SlideSlotId, TextItem>>;
}

const TITLE_TYPES = new Set(["title", "ctrTitle"]);
const BODY_TYPES = new Set(["body", "obj"]);
const COORDINATE_LIMIT = 10_000;

function placeholderType(item: PptxItem) {
  return item.kind === "text" ? (item.placeholder?.type ?? null) : null;
}

function textItems(slide: PptxSlide, types: Set<string>): TextItem[] {
  return slide.items.filter(
    (item): item is TextItem =>
      item.kind === "text" && types.has(placeholderType(item) ?? ""),
  );
}

function byX(a: TextItem, b: TextItem) {
  return (a.frame?.x ?? 0) - (b.frame?.x ?? 0);
}

const TITLE_SLIDE_TYPES: Record<string, SlideLayoutId> = {
  title: "cover",
  secHead: "section",
};
const TITLE_SLIDE_NAMES = new Set<string>(["cover", "section", "closing"]);

export function titleSlideLayout(slide: PptxSlide): SlideLayoutId | null {
  const { type, name } = slide.layout;
  const byType = type ? TITLE_SLIDE_TYPES[type] : undefined;
  if (byType) return byType;
  if (name && TITLE_SLIDE_NAMES.has(name)) return name as SlideLayoutId;
  const hasCenteredTitle = textItems(slide, new Set(["ctrTitle"])).length > 0;
  const hasSubtitle = textItems(slide, new Set(["subTitle"])).length > 0;
  const hasBody = textItems(slide, BODY_TYPES).length > 0;
  return hasCenteredTitle || (hasSubtitle && !hasBody) ? "cover" : null;
}

function planSlots(slide: PptxSlide): SlotPlan {
  const [title] = textItems(slide, TITLE_TYPES);
  const [subtitle] = textItems(slide, new Set(["subTitle"]));
  const bodies = textItems(slide, BODY_TYPES);
  if (!title) return { layout: "blank", slots: {} };
  const titleLayout = titleSlideLayout(slide);
  if (titleLayout && bodies.length <= 1) {
    return {
      layout: titleLayout,
      slots: { title, subtitle: subtitle ?? bodies[0] },
    };
  }
  if (bodies.length === 1) {
    return { layout: "title-content", slots: { title, body: bodies[0] } };
  }
  if (bodies.length === 2) {
    const [left, right] = [...bodies].sort(byX);
    return { layout: "two-content", slots: { title, left, right } };
  }
  return { layout: "title-only", slots: { title } };
}

function slideMapper(size: PptxDocument["size"]) {
  const { width, height } = DEFAULT_SLIDE_SIZE;
  const scale = Math.min(width / size.cx, height / size.cy);
  const offsetX = (width - size.cx * scale) / 2;
  const offsetY = (height - size.cy * scale) / 2;
  const clamp = (value: number) =>
    Math.round(Math.min(Math.max(value, -COORDINATE_LIMIT), COORDINATE_LIMIT));
  return (frame: EmuFrame): SlideFrame => ({
    x: clamp(offsetX + frame.x * scale),
    y: clamp(offsetY + frame.y * scale),
    w: Math.max(1, clamp(frame.w * scale)),
    h: Math.max(1, clamp(frame.h * scale)),
  });
}

function limitParagraphs(paragraphs: TextParagraph[]): TextParagraph[] {
  return paragraphs.slice(0, DECK_LIMITS.paragraphs).map((paragraph) => ({
    ...paragraph,
    runs: paragraph.runs.slice(0, DECK_LIMITS.runs).map((run) => ({
      ...run,
      text: run.text.slice(0, DECK_LIMITS.text),
    })),
  }));
}

function limitTable(table: TableData): TableData {
  return {
    header: table.header,
    rows: table.rows.slice(0, DECK_LIMITS.tableRows).map((row) =>
      row.slice(0, DECK_LIMITS.tableColumns).map((cell) => ({
        paragraphs: limitParagraphs(cell.paragraphs),
      })),
    ),
  };
}

function withoutBold(paragraphs: TextParagraph[]): TextParagraph[] {
  return paragraphs.map((paragraph) => ({
    ...paragraph,
    runs: paragraph.runs.map(({ bold: _bold, ...run }) => run),
  }));
}

function slotParagraphs(slot: SlideSlotId, item: TextItem) {
  const paragraphs = limitParagraphs(item.paragraphs);
  return slot === "title" ? withoutBold(paragraphs) : paragraphs;
}

function freeTextRole(type: string | null): TextRole {
  if (type && TITLE_TYPES.has(type)) return "title";
  if (type === "subTitle") return "subtitle";
  return "body";
}

const WHOLE_SLIDE: SlideFrame = {
  x: 0,
  y: 0,
  w: DEFAULT_SLIDE_SIZE.width,
  h: DEFAULT_SLIDE_SIZE.height,
};

class SlideImporter {
  readonly warnings: DeckCompileWarning[] = [];

  constructor(
    private readonly document: PptxDocument,
    private readonly storeImage: PptxImageStore,
    private readonly newId: IdFactory,
    private readonly toFrame = slideMapper(document.size),
  ) {}

  private warn(slideIndex: number, message: string) {
    this.warnings.push({ slideIndex, message });
  }

  private async imageElement(
    item: Extract<PptxItem, { kind: "image" }>,
    slideIndex: number,
  ): Promise<FreeElement | null> {
    const bytes = await this.document.readMedia(item.mediaPath);
    const image = bytes ? await this.storeImage(bytes) : null;
    if (!image) {
      this.warn(
        slideIndex,
        `Skipped image ${item.mediaPath}: only PNG and JPEG up to 20 MB are supported`,
      );
      return null;
    }
    return {
      id: this.newId(),
      kind: "image",
      frame: item.frame ? this.toFrame(item.frame) : WHOLE_SLIDE,
      image,
      ...(item.alt ? { alt: item.alt.slice(0, 1_000) } : {}),
    };
  }

  private async element(
    item: PptxItem,
    slideIndex: number,
  ): Promise<FreeElement | null> {
    if (item.kind === "image") return this.imageElement(item, slideIndex);
    const frame = item.frame ? this.toFrame(item.frame) : WHOLE_SLIDE;
    if (item.kind === "table") {
      return {
        id: this.newId(),
        kind: "table",
        frame,
        table: limitTable(item.table),
      };
    }
    const role = freeTextRole(placeholderType(item));
    const paragraphs = limitParagraphs(item.paragraphs);
    return {
      id: this.newId(),
      kind: "text",
      role,
      frame,
      paragraphs: role === "title" ? withoutBold(paragraphs) : paragraphs,
    };
  }

  async slide(source: PptxSlide, slideIndex: number): Promise<Slide> {
    const plan = planSlots(source);
    const placed = new Set<PptxItem>(Object.values(plan.slots));
    const slots: Slide["slots"] = {};
    const slotFrames: NonNullable<Slide["slotFrames"]> = {};
    for (const [slot, item] of Object.entries(plan.slots) as [
      SlideSlotId,
      TextItem | undefined,
    ][]) {
      if (!item) continue;
      slots[slot] = { kind: "text", paragraphs: slotParagraphs(slot, item) };
      if (item.frame) slotFrames[slot] = this.toFrame(item.frame);
    }
    const elements: FreeElement[] = [];
    for (const item of source.items) {
      if (placed.has(item)) continue;
      const element = await this.element(item, slideIndex);
      if (element) elements.push(element);
    }
    if (elements.length > DECK_LIMITS.elements) {
      this.warn(slideIndex, `Kept the first ${DECK_LIMITS.elements} elements`);
    }
    if (source.skippedShapes > 0) {
      this.warn(
        slideIndex,
        `Skipped ${source.skippedShapes} charts, diagrams, or other objects that decks cannot hold`,
      );
    }
    return {
      id: this.newId(),
      layout: plan.layout,
      slots,
      ...(Object.keys(slotFrames).length > 0 ? { slotFrames } : {}),
      elements: elements.slice(0, DECK_LIMITS.elements),
      notes: source.notes.slice(0, DECK_LIMITS.text),
    };
  }
}

export async function pptxToDeck(
  document: PptxDocument,
  storeImage: PptxImageStore,
  newId: IdFactory = () => crypto.randomUUID(),
): Promise<PptxImportResult> {
  const importer = new SlideImporter(document, storeImage, newId);
  const sources = document.slides.slice(0, DECK_LIMITS.slides);
  const slides: Slide[] = [];
  for (const [index, source] of sources.entries()) {
    slides.push(await importer.slide(source, index));
  }
  if (document.slides.length > sources.length) {
    importer.warnings.push({
      slideIndex: sources.length - 1,
      message: `Kept the first ${DECK_LIMITS.slides} slides`,
    });
  }
  return {
    content: parseDeckContent({
      version: DECK_CONTENT_VERSION,
      size: { ...DEFAULT_SLIDE_SIZE },
      theme: "default",
      slides,
    }),
    title: document.title,
    warnings: importer.warnings,
  };
}
