import { posix } from "node:path";
import type {
  PptxOutline,
  PptxSlideText,
  TableData,
  TextParagraph,
  TextRun,
} from "@cocurdex/shared";
import { titleSlideLayout } from "./pptx-import";
import type { PptxDocument, PptxItem, PptxSlide } from "./pptx-read";

const TITLE_TYPES = new Set(["title", "ctrTitle"]);
const MARKDOWN_SPECIAL = /([\\`*_[\]|<>#])/g;

function escapeMarkdown(text: string) {
  return text.replace(MARKDOWN_SPECIAL, "\\$1");
}

function runMarkdown(run: TextRun) {
  let text = escapeMarkdown(run.text);
  const edge = /^(\s*)(.*?)(\s*)$/s.exec(text);
  const [, lead = "", core = text, trail = ""] = edge ?? [];
  if (!core) return text;
  text = core;
  if (run.code) text = `\`${run.text.trim()}\``;
  if (run.bold) text = `**${text}**`;
  if (run.italic) text = `*${text}*`;
  if (run.strike) text = `~~${text}~~`;
  if (run.link) text = `[${text}](${run.link})`;
  return `${lead}${text}${trail}`;
}

function plain(paragraph: TextParagraph) {
  return paragraph.runs.map((run) => run.text).join("");
}

function paragraphLine(paragraph: TextParagraph, markdown: boolean) {
  const text = markdown
    ? paragraph.runs.map(runMarkdown).join("")
    : plain(paragraph);
  if (!paragraph.list) return text.trim();
  const indent = "  ".repeat(paragraph.level ?? 0);
  const marker = paragraph.list === "number" ? "1." : "-";
  return `${indent}${marker} ${text.trim()}`;
}

function tableLines(table: TableData, markdown: boolean) {
  const cell = (paragraphs: TextParagraph[]) =>
    paragraphs.map((paragraph) => paragraphLine(paragraph, markdown)).join(" ");
  const rows = table.rows.map(
    (row) => `| ${row.map((item) => cell(item.paragraphs)).join(" | ")} |`,
  );
  if (!markdown) return rows;
  const [first = "", ...rest] = rows;
  const columns = table.rows[0]?.length ?? 1;
  const divider = `|${" --- |".repeat(columns)}`;
  return [first, divider, ...rest];
}

function itemLines(item: PptxItem, markdown: boolean): string[] {
  if (item.kind === "table") return tableLines(item.table, markdown);
  if (item.kind === "image") {
    if (markdown) {
      return [
        `![${escapeMarkdown(item.alt)}](${posix.basename(item.mediaPath)})`,
      ];
    }
    return item.alt ? [`[Image: ${item.alt}]`] : [];
  }
  return item.paragraphs.map((paragraph) => paragraphLine(paragraph, markdown));
}

function readingOrder(a: PptxItem, b: PptxItem) {
  const dy = (a.frame?.y ?? 0) - (b.frame?.y ?? 0);
  return dy !== 0 ? dy : (a.frame?.x ?? 0) - (b.frame?.x ?? 0);
}

function splitTitle(slide: PptxSlide) {
  const titleItem = slide.items.find(
    (item) =>
      item.kind === "text" && TITLE_TYPES.has(item.placeholder?.type ?? ""),
  );
  const rest = slide.items
    .filter((item) => item !== titleItem)
    .sort(readingOrder);
  return { titleItem, rest };
}

function slideText(slide: PptxSlide, index: number): PptxSlideText {
  const { titleItem, rest } = splitTitle(slide);
  const title =
    titleItem?.kind === "text"
      ? titleItem.paragraphs.map(plain).join(" ").trim()
      : "";
  return {
    index,
    title,
    text: rest.flatMap((item) => itemLines(item, false)),
    notes: slide.notes,
  };
}

function slideMarkdown(slide: PptxSlide) {
  const { titleItem, rest } = splitTitle(slide);
  const isCover = titleSlideLayout(slide) !== null;
  const heading =
    titleItem?.kind === "text"
      ? escapeMarkdown(titleItem.paragraphs.map(plain).join(" ").trim())
      : "";
  const blocks = [
    heading ? `${isCover ? "#" : "##"} ${heading}` : "",
    ...rest.map((item) => itemLines(item, true).join("\n")),
    slide.notes ? `Notes: ${slide.notes}` : "",
  ];
  return blocks.filter(Boolean).join("\n\n");
}

export function pptxOutline(document: PptxDocument): PptxOutline {
  return {
    title: document.title,
    slides: document.slides.map(slideText),
    markdown: `${document.slides.map(slideMarkdown).join("\n\n---\n\n")}\n`,
  };
}
