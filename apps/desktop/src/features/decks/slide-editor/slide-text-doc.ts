import {
  DECK_COLORS,
  type DeckColor,
  type TextParagraph,
  type TextRun,
} from "@cocurdex/shared";
import type { JSONContent } from "@tiptap/react";

export const SLIDE_COLOR_MARK = "slideColor";

const MAX_LIST_LEVEL = 4;
const LIST_NODE_TYPES = {
  bullet: "bulletList",
  number: "orderedList",
} as const;
const ALIGNMENTS = new Set(["left", "center", "right"]);

type ListKind = keyof typeof LIST_NODE_TYPES;
type Mark = NonNullable<JSONContent["marks"]>[number];

function listLevel(paragraph: TextParagraph): number {
  return paragraph.level ?? 0;
}

function runMarks(run: TextRun): Mark[] {
  const marks: Mark[] = [];
  if (run.bold) marks.push({ type: "bold" });
  if (run.italic) marks.push({ type: "italic" });
  if (run.underline) marks.push({ type: "underline" });
  if (run.strike) marks.push({ type: "strike" });
  if (run.code) marks.push({ type: "code" });
  if (run.link) marks.push({ type: "link", attrs: { href: run.link } });
  if (run.color) {
    marks.push({ type: SLIDE_COLOR_MARK, attrs: { color: run.color } });
  }
  return marks;
}

function paragraphNode(paragraph: TextParagraph): JSONContent {
  const content = paragraph.runs
    .filter((run) => run.text.length > 0)
    .map((run): JSONContent => {
      const marks = runMarks(run);
      return {
        type: "text",
        text: run.text,
        ...(marks.length > 0 ? { marks } : {}),
      };
    });
  return {
    type: "paragraph",
    ...(paragraph.align ? { attrs: { align: paragraph.align } } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
}

class ParagraphCursor {
  index = 0;

  constructor(readonly paragraphs: readonly TextParagraph[]) {}

  peek(): TextParagraph | undefined {
    return this.paragraphs[this.index];
  }

  take(): TextParagraph {
    const paragraph = this.paragraphs[this.index];
    if (!paragraph) throw new Error("No paragraph left");
    this.index += 1;
    return paragraph;
  }
}

function listNode(
  cursor: ParagraphCursor,
  kind: ListKind,
  level: number,
): JSONContent {
  const items: JSONContent[] = [];
  for (let next = cursor.peek(); next?.list; next = cursor.peek()) {
    const atLevel = listLevel(next) === level;
    if (listLevel(next) < level) break;
    if (atLevel && next.list !== kind) break;
    if (!atLevel && items.length > 0) break;
    const item: JSONContent = {
      type: "listItem",
      content: [paragraphNode(cursor.take())],
    };
    for (let child = cursor.peek(); child?.list; child = cursor.peek()) {
      if (listLevel(child) <= level) break;
      item.content?.push(listNode(cursor, child.list, level + 1));
    }
    items.push(item);
  }
  return { type: LIST_NODE_TYPES[kind], content: items };
}

export function paragraphsToDoc(paragraphs: TextParagraph[]): JSONContent {
  const cursor = new ParagraphCursor(paragraphs);
  const content: JSONContent[] = [];
  for (let next = cursor.peek(); next; next = cursor.peek()) {
    content.push(
      next.list ? listNode(cursor, next.list, 0) : paragraphNode(cursor.take()),
    );
  }
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function isDeckColor(value: unknown): value is DeckColor {
  return DECK_COLORS.some((color) => color === value);
}

function textRun(node: JSONContent): TextRun {
  const run: TextRun = { text: node.text ?? "" };
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") run.bold = true;
    else if (mark.type === "italic") run.italic = true;
    else if (mark.type === "underline") run.underline = true;
    else if (mark.type === "strike") run.strike = true;
    else if (mark.type === "code") run.code = true;
    else if (mark.type === "link" && typeof mark.attrs?.href === "string") {
      run.link = mark.attrs.href;
    } else if (
      mark.type === SLIDE_COLOR_MARK &&
      isDeckColor(mark.attrs?.color)
    ) {
      run.color = mark.attrs.color;
    }
  }
  return run;
}

function toParagraph(
  node: JSONContent,
  list?: { kind: ListKind; level: number },
): TextParagraph {
  const runs = (node.content ?? [])
    .filter((child) => child.type === "text" && child.text)
    .map(textRun);
  const align = node.attrs?.align;
  return {
    runs,
    ...(list ? { list: list.kind, level: list.level } : {}),
    ...(typeof align === "string" && ALIGNMENTS.has(align)
      ? { align: align as TextParagraph["align"] }
      : {}),
  };
}

function listKindOf(type: string | undefined): ListKind | null {
  if (type === "bulletList") return "bullet";
  if (type === "orderedList") return "number";
  return null;
}

function blockParagraphs(
  node: JSONContent,
  depth: number | null,
): TextParagraph[] {
  if (node.type === "paragraph") {
    return [toParagraph(node)];
  }
  const kind = listKindOf(node.type);
  if (!kind) return [];
  const level = Math.min(depth ?? 0, MAX_LIST_LEVEL);
  return (node.content ?? []).flatMap((item) =>
    (item.content ?? []).flatMap((child) =>
      child.type === "paragraph"
        ? [toParagraph(child, { kind, level })]
        : blockParagraphs(child, level + 1),
    ),
  );
}

export function docToParagraphs(doc: JSONContent): TextParagraph[] {
  return (doc.content ?? []).flatMap((node) => blockParagraphs(node, null));
}
