import {
  type DeckCompileWarning,
  type DeckContent,
  type DeckOp,
  type FreeElement,
  SLIDE_SLOT_IDS,
  type Slide,
  type SlideFrame,
  type SlideLayoutId,
  type SlideSlotId,
  type SlotContent,
  type TextParagraph,
} from "@cocurdex/shared";
import { SLIDE_LAYOUTS } from "./layouts";
import {
  compileDeckMarkdown,
  compileMarkdownParagraphs,
  type IdFactory,
} from "./markdown";
import { containFrame } from "./resolve";
import { parseDeckContent } from "./schema";

export interface DeckEditResult {
  content: DeckContent;
  warnings: DeckCompileWarning[];
}

interface EditState {
  slides: Slide[];
  theme: DeckContent["theme"];
  warnings: DeckCompileWarning[];
}

const CONTENT_SLOTS: readonly SlideSlotId[] = ["body", "left", "right"];

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length;
  return Math.min(Math.max(0, index), length);
}

function insertAt<T>(items: readonly T[], index: number, added: T[]): T[] {
  return [...items.slice(0, index), ...added, ...items.slice(index)];
}

function slideIndexOf(slides: readonly Slide[], slideId: string): number {
  const index = slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) throw new Error(`Slide not found: ${slideId}`);
  return index;
}

function replaceSlide(
  slides: readonly Slide[],
  slideId: string,
  update: (slide: Slide) => Slide,
): Slide[] {
  const index = slideIndexOf(slides, slideId);
  return slides.map((slide, position) =>
    position === index ? update(slide) : slide,
  );
}

function layoutHasSlot(layout: SlideLayoutId, slot: SlideSlotId): boolean {
  return SLIDE_LAYOUTS[layout].slots[slot] !== undefined;
}

function sourceParagraphs(
  op: Extract<DeckOp, { op: "setText" }>,
): TextParagraph[] {
  return op.markdown === undefined
    ? op.paragraphs
    : compileMarkdownParagraphs(op.markdown);
}

function setText(slide: Slide, op: Extract<DeckOp, { op: "setText" }>): Slide {
  const paragraphs = sourceParagraphs(op);
  const [kind, name] = splitTarget(op.target);
  if (kind === "slot") {
    const slot = name as SlideSlotId;
    if (!layoutHasSlot(slide.layout, slot)) {
      throw new Error(
        `Slide ${slide.id} uses layout "${slide.layout}", which has no "${slot}" slot`,
      );
    }
    return {
      ...slide,
      slots: { ...slide.slots, [slot]: { kind: "text", paragraphs } },
    };
  }
  const element = elementOf(slide, name);
  if (element.kind !== "text") {
    throw new Error(`Element ${name} is not a text element`);
  }
  return {
    ...slide,
    elements: slide.elements.map((item) =>
      item.id === name ? { ...element, paragraphs } : item,
    ),
  };
}

const IMAGE_AREA: SlideFrame = { x: 160, y: 120, w: 960, h: 520 };

function addImage(
  slide: Slide,
  op: Extract<DeckOp, { op: "addImage" }>,
  newId: IdFactory,
): Slide {
  const element: FreeElement = {
    id: newId(),
    kind: "image",
    frame: op.frame ?? containFrame(IMAGE_AREA, op.image),
    image: op.image,
    ...(op.alt ? { alt: op.alt } : {}),
  };
  return { ...slide, elements: [...slide.elements, element] };
}

function elementOf(slide: Slide, elementId: string): FreeElement {
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element) {
    throw new Error(`Element not found on ${slide.id}: ${elementId}`);
  }
  return element;
}

function setImage(
  slide: Slide,
  op: Extract<DeckOp, { op: "setImage" }>,
): Slide {
  const element = elementOf(slide, op.elementId);
  if (element.kind !== "image") {
    throw new Error(`Element ${op.elementId} is not an image`);
  }
  return {
    ...slide,
    elements: slide.elements.map((item) =>
      item.id === op.elementId ? { ...element, image: op.image } : item,
    ),
  };
}

function deleteElement(slide: Slide, elementId: string): Slide {
  elementOf(slide, elementId);
  return {
    ...slide,
    elements: slide.elements.filter((item) => item.id !== elementId),
  };
}

function splitTarget(target: string): ["slot" | "element", string] {
  const separator = target.indexOf(":");
  const kind = target.slice(0, separator);
  if (kind !== "slot" && kind !== "element") {
    throw new Error(`Unknown text target: ${target}`);
  }
  return [kind, target.slice(separator + 1)];
}

function withFreshIds(slide: Slide, newId: IdFactory): Slide {
  return {
    ...structuredClone(slide),
    id: newId(),
    elements: slide.elements.map((element) => ({
      ...structuredClone(element),
      id: newId(),
    })),
  };
}

function oldSlotFrame(slide: Slide, slot: SlideSlotId): SlideFrame {
  const frame =
    slide.slotFrames?.[slot] ?? SLIDE_LAYOUTS[slide.layout].slots[slot]?.frame;
  if (!frame) throw new Error(`Slot ${slot} has no frame`);
  return frame;
}

function slotAsElement(
  slide: Slide,
  slot: SlideSlotId,
  content: SlotContent,
  newId: IdFactory,
): FreeElement {
  const frame = oldSlotFrame(slide, slot);
  if (content.kind === "table") {
    return { id: newId(), kind: "table", frame, table: content.table };
  }
  const role = SLIDE_LAYOUTS[slide.layout].slots[slot]?.role ?? "body";
  return {
    id: newId(),
    kind: "text",
    role,
    frame,
    paragraphs: content.paragraphs,
  };
}

function presentSlots(slide: Slide): [SlideSlotId, SlotContent][] {
  return SLIDE_SLOT_IDS.flatMap((slot) => {
    const content = slide.slots[slot];
    return content ? [[slot, content] as [SlideSlotId, SlotContent]] : [];
  });
}

function mergeIntoBody(
  columns: [SlideSlotId, SlotContent][],
): { body: SlotContent; leftover: [SlideSlotId, SlotContent][] } | null {
  const [first] = columns;
  if (!first) return null;
  if (columns.every(([, content]) => content.kind === "text")) {
    const paragraphs = columns.flatMap(([, content]) =>
      content.kind === "text" ? content.paragraphs : [],
    );
    return { body: { kind: "text", paragraphs }, leftover: [] };
  }
  const table =
    columns.find(([, content]) => content.kind === "table") ?? first;
  return {
    body: table[1],
    leftover: columns.filter((column) => column !== table),
  };
}

function remapContentSlots(
  columns: [SlideSlotId, SlotContent][],
  layout: SlideLayoutId,
): {
  slots: Partial<Record<SlideSlotId, SlotContent>>;
  leftover: [SlideSlotId, SlotContent][];
} {
  const fits = columns.filter(([slot]) => layoutHasSlot(layout, slot));
  const misfits = columns.filter(([slot]) => !layoutHasSlot(layout, slot));
  const slots: Partial<Record<SlideSlotId, SlotContent>> =
    Object.fromEntries(fits);
  if (misfits.length === 0) return { slots, leftover: [] };
  if (layoutHasSlot(layout, "body") && !slots.body) {
    const merged = mergeIntoBody(misfits);
    return merged
      ? { slots: { ...slots, body: merged.body }, leftover: merged.leftover }
      : { slots, leftover: misfits };
  }
  const freeColumns = (["left", "right"] as const).filter(
    (slot) => layoutHasSlot(layout, slot) && !slots[slot],
  );
  const placed = misfits.slice(0, freeColumns.length);
  placed.forEach(([, content], index) => {
    const column = freeColumns[index];
    if (column) slots[column] = content;
  });
  return { slots, leftover: misfits.slice(placed.length) };
}

function setLayout(
  slide: Slide,
  layout: SlideLayoutId,
  newId: IdFactory,
): Slide {
  if (slide.layout === layout) return slide;
  const present = presentSlots(slide);
  const isContent = (slot: SlideSlotId) => CONTENT_SLOTS.includes(slot);
  const others = present.filter(([slot]) => !isContent(slot));
  const kept = others.filter(([slot]) => layoutHasSlot(layout, slot));
  const remapped = remapContentSlots(
    present.filter(([slot]) => isContent(slot)),
    layout,
  );
  const leftover = [
    ...others.filter(([slot]) => !layoutHasSlot(layout, slot)),
    ...remapped.leftover,
  ].sort(([a], [b]) => SLIDE_SLOT_IDS.indexOf(a) - SLIDE_SLOT_IDS.indexOf(b));
  const { slotFrames: _slotFrames, ...rest } = slide;
  return {
    ...rest,
    layout,
    slots: { ...Object.fromEntries(kept), ...remapped.slots },
    elements: [
      ...slide.elements,
      ...leftover.map(([slot, content]) =>
        slotAsElement(slide, slot, content, newId),
      ),
    ],
  };
}

function insertSlides(
  state: EditState,
  op: Extract<DeckOp, { op: "insertSlides" }>,
  newId: IdFactory,
): EditState {
  const compiled = compileDeckMarkdown(op.markdown, newId);
  const index = clampIndex(op.index, state.slides.length);
  return {
    ...state,
    slides: insertAt(state.slides, index, compiled.content.slides),
    warnings: [
      ...state.warnings,
      ...compiled.warnings.map((warning) => ({
        ...warning,
        slideIndex: warning.slideIndex + index,
      })),
    ],
  };
}

function moveSlide(slides: readonly Slide[], slideId: string, index: number) {
  const from = slideIndexOf(slides, slideId);
  const moving = slides[from];
  if (!moving) return [...slides];
  const remaining = slides.filter((_, position) => position !== from);
  return insertAt(remaining, clampIndex(index, remaining.length), [moving]);
}

function applyOp(state: EditState, op: DeckOp, newId: IdFactory): EditState {
  const { slides } = state;
  switch (op.op) {
    case "addSlide": {
      const slide: Slide = {
        id: newId(),
        layout: op.layout,
        slots: {},
        elements: [],
        notes: "",
      };
      const index = clampIndex(op.index, slides.length);
      return { ...state, slides: insertAt(slides, index, [slide]) };
    }
    case "insertSlides":
      return insertSlides(state, op, newId);
    case "duplicateSlide": {
      const index = slideIndexOf(slides, op.slideId);
      const source = slides[index];
      if (!source) return state;
      const copy = withFreshIds(source, newId);
      return { ...state, slides: insertAt(slides, index + 1, [copy]) };
    }
    case "deleteSlide": {
      const index = slideIndexOf(slides, op.slideId);
      return {
        ...state,
        slides: slides.filter((_, position) => position !== index),
      };
    }
    case "moveSlide":
      return { ...state, slides: moveSlide(slides, op.slideId, op.index) };
    case "setLayout":
      return {
        ...state,
        slides: replaceSlide(slides, op.slideId, (slide) =>
          setLayout(slide, op.layout, newId),
        ),
      };
    case "setText":
      return {
        ...state,
        slides: replaceSlide(slides, op.slideId, (slide) => setText(slide, op)),
      };
    case "setNotes":
      return {
        ...state,
        slides: replaceSlide(slides, op.slideId, (slide) => ({
          ...slide,
          notes: op.notes,
        })),
      };
    case "setTheme":
      return { ...state, theme: op.theme };
    case "addImage":
      return {
        ...state,
        slides: replaceSlide(slides, op.slideId, (slide) =>
          addImage(slide, op, newId),
        ),
      };
    case "setImage":
      return {
        ...state,
        slides: replaceSlide(slides, op.slideId, (slide) =>
          setImage(slide, op),
        ),
      };
    case "deleteElement":
      return {
        ...state,
        slides: replaceSlide(slides, op.slideId, (slide) =>
          deleteElement(slide, op.elementId),
        ),
      };
  }
}

export function applyDeckOps(
  content: DeckContent,
  ops: readonly DeckOp[],
  newId: IdFactory = () => crypto.randomUUID(),
): DeckEditResult {
  const initial: EditState = {
    slides: content.slides,
    theme: content.theme,
    warnings: [],
  };
  const final = ops.reduce((state, op) => applyOp(state, op, newId), initial);
  return {
    content: parseDeckContent({
      ...content,
      theme: final.theme,
      slides: final.slides,
    }),
    warnings: final.warnings,
  };
}
