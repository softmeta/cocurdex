import { parseNoteMarkdown } from "@cocurdex/note-doc";
import {
  DECK_CONTENT_VERSION,
  DEFAULT_SLIDE_SIZE,
  type DeckCompileWarning,
  type DeckContent,
  type FreeElement,
  type Slide,
  type SlideLayoutId,
  type SlideSlotId,
  type SlotContent,
  type TableCell,
  type TableData,
  type TextParagraph,
  type TextRun,
} from "@cocurdex/shared";
import { SLIDE_LAYOUTS } from "./layouts";

interface MarkdownNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: MarkdownNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export type IdFactory = () => string;

export interface CompiledDeck {
  content: DeckContent;
  title: string | null;
  warnings: DeckCompileWarning[];
}

const NOTES_PREFIX = /^(notes?|备注)\s*[:：]\s*/iu;
const TABLE_CAPTION_HEIGHT = 88;
const TABLE_CAPTION_GAP = 16;
const MAX_LIST_LEVEL = 4;
const SLIDE_SEPARATOR = /^ {0,3}-{3,}\s*$/;
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

function isolateSlideSeparators(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const marker = CODE_FENCE.exec(line)?.[1];
      if (marker && (!fence || marker.startsWith(fence))) {
        fence = fence ? null : marker;
        return line;
      }
      return !fence && SLIDE_SEPARATOR.test(line) ? "\n---\n" : line;
    })
    .join("\n");
}

function plainText(node: MarkdownNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(plainText).join("");
}

function runFromText(node: MarkdownNode): TextRun {
  const run: TextRun = { text: node.text ?? "" };
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") run.bold = true;
    if (mark.type === "italic") run.italic = true;
    if (mark.type === "underline") run.underline = true;
    if (mark.type === "strike") run.strike = true;
    if (mark.type === "code") run.code = true;
    const href = mark.type === "link" ? mark.attrs?.href : undefined;
    if (typeof href === "string" && URL.canParse(href)) run.link = href;
  }
  return run;
}

function inlineRuns(node: MarkdownNode): TextRun[] {
  const runs: TextRun[] = [];
  for (const child of node.content ?? []) {
    if (child.type === "text") runs.push(runFromText(child));
    else if (child.type === "hardBreak") runs.push({ text: "\n" });
    else runs.push(...inlineRuns(child));
  }
  return runs;
}

function listParagraphs(list: MarkdownNode, level: number): TextParagraph[] {
  const kind = list.type === "orderedList" ? "number" : "bullet";
  const paragraphs: TextParagraph[] = [];
  for (const item of list.content ?? []) {
    const checked =
      item.type === "taskItem" ? item.attrs?.checked === true : null;
    let first = true;
    for (const child of item.content ?? []) {
      if (isList(child)) {
        paragraphs.push(...listParagraphs(child, level + 1));
        continue;
      }
      const runs = inlineRuns(child);
      if (first && checked !== null) {
        runs.unshift({ text: checked ? "☑ " : "☐ " });
      }
      paragraphs.push({
        runs,
        list: kind,
        level: Math.min(level, MAX_LIST_LEVEL),
      });
      first = false;
    }
  }
  return paragraphs;
}

function isList(node: MarkdownNode): boolean {
  return (
    node.type === "bulletList" ||
    node.type === "orderedList" ||
    node.type === "taskList"
  );
}

function blockParagraphs(node: MarkdownNode): TextParagraph[] {
  if (isList(node)) return listParagraphs(node, 0);
  if (node.type === "codeBlock") {
    return plainText(node)
      .split("\n")
      .map((line) => ({ runs: [{ text: line, code: true }] }));
  }
  if (node.type === "blockquote") {
    return (node.content ?? []).flatMap(blockParagraphs);
  }
  if (node.type === "heading") {
    return [{ runs: inlineRuns(node).map((run) => ({ ...run, bold: true })) }];
  }
  return [{ runs: inlineRuns(node) }];
}

function tableData(node: MarkdownNode): TableData {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map(
      (cell): TableCell => ({
        paragraphs: (cell.content ?? []).flatMap(blockParagraphs),
      }),
    ),
  );
  const header = (node.content?.[0]?.content ?? []).every(
    (cell) => cell.type === "tableHeader",
  );
  return { header, rows };
}

function splitSlides(doc: MarkdownNode): MarkdownNode[][] {
  const slides: MarkdownNode[][] = [[]];
  for (const node of doc.content ?? []) {
    if (node.type === "horizontalRule") {
      slides.push([]);
    } else {
      slides[slides.length - 1]?.push(node);
    }
  }
  return slides.filter((nodes) => nodes.length > 0);
}

interface SlideParts {
  heading: MarkdownNode | null;
  body: MarkdownNode[];
  notes: string[];
}

function slideParts(nodes: MarkdownNode[]): SlideParts {
  const parts: SlideParts = { heading: null, body: [], notes: [] };
  let inNotes = false;
  for (const node of nodes) {
    const text = plainText(node);
    if (!inNotes && node.type === "paragraph" && NOTES_PREFIX.test(text)) {
      inNotes = true;
      const rest = text.replace(NOTES_PREFIX, "");
      if (rest) parts.notes.push(rest);
      continue;
    }
    if (inNotes) {
      parts.notes.push(text);
    } else if (!parts.heading && node.type === "heading") {
      parts.heading = node;
    } else {
      parts.body.push(node);
    }
  }
  return parts;
}

function textSlot(paragraphs: TextParagraph[]): SlotContent {
  return { kind: "text", paragraphs };
}

function columnsOf(
  body: MarkdownNode[],
): [MarkdownNode[], MarkdownNode[]] | null {
  const starts = body.flatMap((node, index) =>
    node.type === "heading" && node.attrs?.level === 3 ? [index] : [],
  );
  if (starts.length !== 2 || starts[0] !== 0) return null;
  const split = starts[1] ?? 0;
  return [body.slice(0, split), body.slice(split)];
}

interface Draft {
  layout: SlideLayoutId;
  slots: Partial<Record<SlideSlotId, SlotContent>>;
  slotFrames?: Slide["slotFrames"];
  elements: FreeElement[];
}

function titleLikeLayout(index: number, count: number): SlideLayoutId {
  if (index === 0) return "cover";
  if (index === count - 1) return "closing";
  return "section";
}

function tableDraft(
  title: SlotContent | undefined,
  intro: TextParagraph[],
  table: TableData,
  newId: IdFactory,
): Draft {
  const bodyFrame = SLIDE_LAYOUTS["title-content"].slots.body?.frame;
  const slots: Draft["slots"] = { body: { kind: "table", table } };
  if (title) slots.title = title;
  if (intro.length === 0 || !bodyFrame) {
    return { layout: "title-content", slots, elements: [] };
  }
  const offset = TABLE_CAPTION_HEIGHT + TABLE_CAPTION_GAP;
  return {
    layout: "title-content",
    slots,
    slotFrames: {
      body: { ...bodyFrame, y: bodyFrame.y + offset, h: bodyFrame.h - offset },
    },
    elements: [
      {
        id: newId(),
        kind: "text",
        role: "body",
        frame: { ...bodyFrame, h: TABLE_CAPTION_HEIGHT },
        paragraphs: intro,
      },
    ],
  };
}

function contentDraft(
  parts: SlideParts,
  newId: IdFactory,
  warn: (message: string) => void,
): Draft {
  const title = parts.heading
    ? textSlot([{ runs: inlineRuns(parts.heading) }])
    : undefined;
  const withTitle = (slots: Draft["slots"]) =>
    title ? { title, ...slots } : slots;
  const body = parts.body.filter((node) => {
    if (node.type !== "image") return true;
    warn(
      `Markdown images are dropped ("${String(node.attrs?.src ?? "")}"); add them with \`cocurdex deck image\``,
    );
    return false;
  });
  const tables = body.filter((node) => node.type === "table");
  if (tables.length > 1) {
    warn(
      "Only the first table on a slide is kept; split the others into their own slides",
    );
  }
  const [firstTable] = tables;
  if (firstTable) {
    const intro = body
      .filter((node) => node.type !== "table")
      .flatMap(blockParagraphs);
    return tableDraft(title, intro, tableData(firstTable), newId);
  }
  const columns = columnsOf(body);
  if (columns) {
    return {
      layout: "two-content",
      slots: withTitle({
        left: textSlot(columns[0].flatMap(blockParagraphs)),
        right: textSlot(columns[1].flatMap(blockParagraphs)),
      }),
      elements: [],
    };
  }
  if (body.length === 0) {
    return {
      layout: title ? "title-only" : "blank",
      slots: withTitle({}),
      elements: [],
    };
  }
  return {
    layout: "title-content",
    slots: withTitle({ body: textSlot(body.flatMap(blockParagraphs)) }),
    elements: [],
  };
}

function isTitleLike(parts: SlideParts): boolean {
  return (
    parts.heading?.attrs?.level === 1 &&
    parts.body.every((node) => node.type === "paragraph")
  );
}

function titleLikeDraft(parts: SlideParts, layout: SlideLayoutId): Draft {
  const slots: Draft["slots"] = {};
  if (parts.heading)
    slots.title = textSlot([{ runs: inlineRuns(parts.heading) }]);
  const subtitle = parts.body.flatMap(blockParagraphs);
  if (subtitle.length > 0) slots.subtitle = textSlot(subtitle);
  return { layout, slots, elements: [] };
}

export function compileMarkdownParagraphs(markdown: string): TextParagraph[] {
  const doc = parseNoteMarkdown(markdown) as MarkdownNode;
  return (doc.content ?? []).flatMap(blockParagraphs);
}

export function compileDeckMarkdown(
  markdown: string,
  newId: IdFactory = () => crypto.randomUUID(),
): CompiledDeck {
  const groups = splitSlides(
    parseNoteMarkdown(isolateSlideSeparators(markdown)) as MarkdownNode,
  );
  const warnings: DeckCompileWarning[] = [];
  let deckTitle: string | null = null;
  const slides = groups.map((nodes, index): Slide => {
    const parts = slideParts(nodes);
    if (index === 0 && parts.heading)
      deckTitle = plainText(parts.heading).trim() || null;
    const warn = (message: string) =>
      warnings.push({ slideIndex: index, message });
    const draft = isTitleLike(parts)
      ? titleLikeDraft(parts, titleLikeLayout(index, groups.length))
      : contentDraft(parts, newId, warn);
    return {
      id: newId(),
      layout: draft.layout,
      slots: draft.slots,
      ...(draft.slotFrames ? { slotFrames: draft.slotFrames } : {}),
      elements: draft.elements,
      notes: parts.notes.join("\n").trim(),
    };
  });
  return {
    content: {
      version: DECK_CONTENT_VERSION,
      size: { ...DEFAULT_SLIDE_SIZE },
      theme: "default",
      slides,
    },
    title: deckTitle,
    warnings,
  };
}
