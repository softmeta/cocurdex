import type { TableData, TextParagraph } from "@cocurdex/shared";

const WIDE_CHARACTER = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
const NARROW_EM = 0.55;
const WIDE_EM = 1;
export const LIST_INDENT_EM = 1.25;
export const PARAGRAPH_GAP_EM = 0.3;
const SIZE_STEP = 2;

export const TEXT_INSET = 8;
export const TABLE_CELL_PADDING = 10;

function textWidthEm(text: string): number {
  let width = 0;
  for (const character of text) {
    width += WIDE_CHARACTER.test(character) ? WIDE_EM : NARROW_EM;
  }
  return width;
}

export function paragraphIndentEm(paragraph: TextParagraph): number {
  const level = paragraph.level ?? 0;
  return LIST_INDENT_EM * (paragraph.list ? level + 1 : level);
}

export function estimateTextHeight(
  paragraphs: TextParagraph[],
  width: number,
  fontSize: number,
  lineHeight: number,
): number {
  let lines = 0;
  for (const paragraph of paragraphs) {
    const available = Math.max(
      width / fontSize - paragraphIndentEm(paragraph),
      1,
    );
    const text = paragraph.runs.map((run) => run.text).join("");
    for (const line of text.split("\n")) {
      lines += Math.max(1, Math.ceil(textWidthEm(line) / available));
    }
  }
  const gaps = Math.max(0, paragraphs.length - 1) * PARAGRAPH_GAP_EM;
  return (lines * lineHeight + gaps) * fontSize;
}

export interface FitResult {
  fontSize: number;
  overflow: boolean;
}

function fitSize(
  range: { max: number; min: number },
  fits: (size: number) => boolean,
): FitResult {
  for (let size = range.max; size >= range.min; size -= SIZE_STEP) {
    if (fits(size)) return { fontSize: size, overflow: false };
  }
  return { fontSize: range.min, overflow: true };
}

export function fitText(
  paragraphs: TextParagraph[],
  box: { w: number; h: number },
  range: { max: number; min: number },
  lineHeight: number,
): FitResult {
  const width = box.w - TEXT_INSET * 2;
  const height = box.h - TEXT_INSET * 2;
  return fitSize(
    range,
    (size) => estimateTextHeight(paragraphs, width, size, lineHeight) <= height,
  );
}

export function estimateTableHeight(
  table: TableData,
  width: number,
  fontSize: number,
  lineHeight: number,
): number {
  const columns = Math.max(1, ...table.rows.map((row) => row.length));
  const cellWidth = width / columns - TABLE_CELL_PADDING * 2;
  return table.rows.reduce((total, row) => {
    const tallest = Math.max(
      0,
      ...row.map((cell) =>
        estimateTextHeight(cell.paragraphs, cellWidth, fontSize, lineHeight),
      ),
    );
    return total + tallest + TABLE_CELL_PADDING * 2;
  }, 0);
}

export function fitTable(
  table: TableData,
  box: { w: number; h: number },
  range: { max: number; min: number },
  lineHeight: number,
): FitResult {
  return fitSize(
    range,
    (size) => estimateTableHeight(table, box.w, size, lineHeight) <= box.h,
  );
}
