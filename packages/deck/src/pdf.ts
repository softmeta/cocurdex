import {
  type DeckColor,
  type DeckContent,
  deckImageHashes,
  type SlideFrame,
  type TableData,
  type TextParagraph,
  type TextRun,
} from "@cocurdex/shared";
import PDFDocument from "pdfkit";
import { type DeckImageLoader, loadDeckImages } from "./images";
import { lineWidth, wrapPieces } from "./line-wrap";
import { listMarkers } from "./list-markers";
import { drawPdfPattern, drawPdfShape, fillPaint } from "./pdf-paint";
import { type ResolvedImage, type ResolvedItem, resolveSlide } from "./resolve";
import { splitCjk } from "./script-segments";
import {
  LIST_INDENT_EM,
  PARAGRAPH_GAP_EM,
  paragraphIndentEm,
  TABLE_CELL_PADDING,
  TEXT_INSET,
} from "./text-fit";
import type { DeckFont, DeckTheme, TextAlign, TextStroke } from "./theme";
import { deckTheme } from "./themes";

export interface PdfFontSource {
  path: string;
  face?: string;
}

export interface PdfFontSet {
  regular: PdfFontSource;
  bold?: PdfFontSource;
  mono?: PdfFontSource;
  serif?: PdfFontSource;
  serifBold?: PdfFontSource;
}

type Doc = PDFKit.PDFDocument;

const PT_PER_PX = 0.75;
const SYNTHETIC_BOLD_STROKE_EM = 0.03;
const FONT = {
  regular: "deck-regular",
  bold: "deck-bold",
  mono: "deck-mono",
  serif: "deck-serif",
  serifBold: "deck-serif-bold",
} as const;
const BOLD_FACES = new Set<string>([FONT.bold, FONT.serifBold]);
const NO_PAGE_BREAK_HEIGHT = 100_000;

interface TextStyle {
  fontSize: number;
  lineHeight: number;
  color: DeckColor;
  font: DeckFont;
  bold: boolean;
  align: TextAlign;
  italic?: boolean;
  hollow?: boolean;
  stroke?: TextStroke;
}

interface Painter {
  doc: Doc;
  theme: DeckTheme;
  fonts: PdfFontSet;
  images: ReadonlyMap<string, Buffer>;
}

function hex(theme: DeckTheme, token: DeckColor): string {
  return `#${theme.colors[token]}`;
}

function registerFonts(doc: Doc, fonts: PdfFontSet) {
  doc.registerFont(FONT.regular, fonts.regular.path, fonts.regular.face);
  if (fonts.bold) doc.registerFont(FONT.bold, fonts.bold.path, fonts.bold.face);
  if (fonts.mono) doc.registerFont(FONT.mono, fonts.mono.path, fonts.mono.face);
  if (fonts.serif) {
    doc.registerFont(FONT.serif, fonts.serif.path, fonts.serif.face);
  }
  if (fonts.serifBold) {
    doc.registerFont(
      FONT.serifBold,
      fonts.serifBold.path,
      fonts.serifBold.face,
    );
  }
}

function fontFor(
  painter: Painter,
  run: TextRun,
  style: TextStyle,
  cjk: boolean,
): string {
  const { fonts } = painter;
  const bold = run.bold || style.bold;
  const mono = run.code || style.font === "mono";
  if (mono && fonts.mono && !cjk) return FONT.mono;
  if (style.font === "serif" && fonts.serif && !cjk) {
    return bold && fonts.serifBold ? FONT.serifBold : FONT.serif;
  }
  return bold && fonts.bold ? FONT.bold : FONT.regular;
}

interface RunPiece {
  run: TextRun;
  text: string;
  font: string;
}

function runPieces(
  painter: Painter,
  runs: TextRun[],
  style: TextStyle,
): RunPiece[] {
  return runs.flatMap((run) =>
    splitCjk(run.text).map((segment) => ({
      run,
      text: segment.text,
      font: fontFor(painter, run, style, segment.cjk),
    })),
  );
}

function useLineHeight(painter: Painter, style: TextStyle) {
  const { doc } = painter;
  doc.font(FONT.regular).fontSize(style.fontSize);
  const natural = doc.currentLineHeight(false);
  return Math.max(0, style.fontSize * style.lineHeight - natural);
}

function paragraphText(paragraph: TextParagraph): string {
  return paragraph.runs.map((run) => run.text).join("") || " ";
}

function paragraphHeight(
  painter: Painter,
  paragraph: TextParagraph,
  width: number,
  style: TextStyle,
): number {
  const lineGap = useLineHeight(painter, style);
  const indent = paragraphIndentEm(paragraph) * style.fontSize;
  return painter.doc.heightOfString(paragraphText(paragraph), {
    width: Math.max(1, width - indent),
    lineGap,
  });
}

function paragraphsHeight(
  painter: Painter,
  paragraphs: TextParagraph[],
  width: number,
  style: TextStyle,
): number {
  const gaps = Math.max(0, paragraphs.length - 1) * PARAGRAPH_GAP_EM;
  return paragraphs.reduce(
    (total, paragraph) =>
      total + paragraphHeight(painter, paragraph, width, style),
    gaps * style.fontSize,
  );
}

function applyRunStyle(
  painter: Painter,
  run: TextRun,
  font: string,
  style: TextStyle,
): PDFKit.Mixins.TextOptions {
  const { doc, theme } = painter;
  const bold = run.bold || style.bold;
  const synthetic = bold && !BOLD_FACES.has(font) && font !== FONT.mono;
  const color = hex(theme, run.color ?? style.color);
  const stroke = style.stroke;
  doc
    .font(font)
    .fontSize(style.fontSize)
    .fillColor(color)
    .strokeColor(stroke ? hex(theme, stroke.color) : color)
    .strokeOpacity(stroke?.opacity ?? 1)
    .lineWidth(stroke?.width ?? style.fontSize * SYNTHETIC_BOLD_STROKE_EM);
  return {
    underline: run.underline || Boolean(run.link),
    strike: run.strike,
    oblique: run.italic || style.italic,
    link: run.link,
    fill: !style.hollow,
    stroke: synthetic || Boolean(stroke),
  };
}

function measure(painter: Painter, piece: RunPiece, style: TextStyle) {
  return painter.doc
    .font(piece.font)
    .fontSize(style.fontSize)
    .widthOfString(piece.text);
}

function drawAlignedRuns(
  painter: Painter,
  pieces: RunPiece[],
  box: { x: number; y: number; w: number },
  style: TextStyle,
  lineGap: number,
  align: "center" | "right",
) {
  const { doc } = painter;
  const lineHeight =
    doc.font(FONT.regular).fontSize(style.fontSize).currentLineHeight(true) +
    lineGap;
  const share = align === "center" ? 0.5 : 1;
  const width = (piece: RunPiece) => measure(painter, piece, style);
  wrapPieces(pieces, width, box.w).forEach((line, lineIndex) => {
    const free = box.w - lineWidth(line, width);
    let x = box.x + Math.max(0, free) * share;
    const y = box.y + lineIndex * lineHeight;
    for (const piece of line) {
      const options = applyRunStyle(painter, piece.run, piece.font, style);
      doc.text(piece.text, x, y, { ...options, lineBreak: false });
      x += piece.width;
    }
  });
}

function drawRuns(
  painter: Painter,
  paragraph: TextParagraph,
  box: { x: number; y: number; w: number },
  style: TextStyle,
  lineGap: number,
) {
  const { doc } = painter;
  const runs = paragraph.runs.length > 0 ? paragraph.runs : [{ text: " " }];
  const pieces = runPieces(painter, runs, style);
  const align = paragraph.align ?? style.align;
  if (align === "center" || align === "right") {
    drawAlignedRuns(painter, pieces, box, style, lineGap, align);
    return;
  }
  pieces.forEach(({ run, text, font }, index) => {
    const options: PDFKit.Mixins.TextOptions = {
      ...applyRunStyle(painter, run, font, style),
      width: box.w,
      height: NO_PAGE_BREAK_HEIGHT,
      lineGap,
      align,
      continued: index < pieces.length - 1,
    };
    if (index === 0) doc.text(text, box.x, box.y, options);
    else doc.text(text, options);
  });
}

function drawParagraphs(
  painter: Painter,
  paragraphs: TextParagraph[],
  box: { x: number; y: number; w: number },
  style: TextStyle,
) {
  const { doc, theme } = painter;
  const markers = listMarkers(paragraphs);
  let y = box.y;
  paragraphs.forEach((paragraph, index) => {
    const lineGap = useLineHeight(painter, style);
    const indent = paragraphIndentEm(paragraph) * style.fontSize;
    const marker = markers[index];
    if (marker) {
      const level = paragraph.level ?? 0;
      doc
        .font(style.bold && painter.fonts.bold ? FONT.bold : FONT.regular)
        .fontSize(style.fontSize)
        .fillColor(hex(theme, style.color))
        .text(marker, box.x + level * LIST_INDENT_EM * style.fontSize, y, {
          lineBreak: false,
          lineGap,
        });
    }
    const width = Math.max(1, box.w - indent);
    drawRuns(
      painter,
      paragraph,
      { x: box.x + indent, y, w: width },
      style,
      lineGap,
    );
    y +=
      paragraphHeight(painter, paragraph, box.w, style) +
      PARAGRAPH_GAP_EM * style.fontSize;
  });
}

function clipTo(doc: Doc, frame: SlideFrame, draw: () => void) {
  doc.save();
  doc.rect(frame.x, frame.y, frame.w, frame.h).clip();
  draw();
  doc.restore();
}

function drawText(
  painter: Painter,
  item: Extract<ResolvedItem, { kind: "text" }>,
) {
  const style: TextStyle = {
    fontSize: item.fontSize,
    lineHeight: item.lineHeight,
    color: item.color,
    font: item.font,
    bold: item.bold,
    align: item.align,
    italic: item.italic,
    hollow: item.hollow,
    stroke: item.stroke,
  };
  const inner = {
    x: item.frame.x + TEXT_INSET,
    y: item.frame.y + TEXT_INSET,
    w: item.frame.w - TEXT_INSET * 2,
    h: item.frame.h - TEXT_INSET * 2,
  };
  const height = paragraphsHeight(painter, item.paragraphs, inner.w, style);
  const free = Math.max(0, inner.h - height);
  const offset = { top: 0, middle: free / 2, bottom: free }[item.valign];
  clipTo(painter.doc, item.frame, () =>
    drawParagraphs(
      painter,
      item.paragraphs,
      { x: inner.x, y: inner.y + offset, w: inner.w },
      style,
    ),
  );
}

function tableRowHeights(
  painter: Painter,
  table: TableData,
  cellWidth: number,
  style: TextStyle,
): number[] {
  return table.rows.map((row, rowIndex) => {
    const cellStyle = { ...style, bold: table.header && rowIndex === 0 };
    const tallest = Math.max(
      0,
      ...row.map((cell) =>
        paragraphsHeight(painter, cell.paragraphs, cellWidth, cellStyle),
      ),
    );
    return tallest + TABLE_CELL_PADDING * 2;
  });
}

function drawTable(
  painter: Painter,
  item: Extract<ResolvedItem, { kind: "table" }>,
) {
  const { doc, theme } = painter;
  const { table, frame } = item;
  const columns = Math.max(1, ...table.rows.map((row) => row.length));
  const columnWidth = frame.w / columns;
  const style: TextStyle = {
    fontSize: item.fontSize,
    lineHeight: item.lineHeight,
    color: "text",
    font: painter.theme.fonts.body,
    bold: false,
    align: "left",
  };
  const heights = tableRowHeights(
    painter,
    table,
    columnWidth - TABLE_CELL_PADDING * 2,
    style,
  );
  let y = frame.y;
  table.rows.forEach((row, rowIndex) => {
    const height = heights[rowIndex] ?? 0;
    const isHeader = table.header && rowIndex === 0;
    for (let column = 0; column < columns; column += 1) {
      const x = frame.x + column * columnWidth;
      if (isHeader) {
        doc.rect(x, y, columnWidth, height).fill(hex(theme, "surface"));
      }
      doc
        .rect(x, y, columnWidth, height)
        .lineWidth(1)
        .stroke(`#${theme.tableBorder}`);
      const cell = row[column];
      if (!cell) continue;
      drawParagraphs(
        painter,
        cell.paragraphs,
        {
          x: x + TABLE_CELL_PADDING,
          y: y + TABLE_CELL_PADDING,
          w: columnWidth - TABLE_CELL_PADDING * 2,
        },
        { ...style, bold: isHeader },
      );
    }
    y += height;
  });
}

function drawImage(painter: Painter, item: ResolvedImage) {
  const bytes = painter.images.get(item.image.hash);
  if (!bytes) return;
  const { x, y, w, h } = item.frame;
  painter.doc.image(bytes, x, y, { width: w, height: h });
}

function drawItem(painter: Painter, item: ResolvedItem) {
  if (item.kind === "shape") drawPdfShape(painter.doc, painter.theme, item);
  else if (item.kind === "pattern") {
    drawPdfPattern(painter.doc, painter.theme, item);
  } else if (item.kind === "image") drawImage(painter, item);
  else if (item.kind === "table") drawTable(painter, item);
  else drawText(painter, item);
}

function collect(doc: Doc): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function exportDeckToPdf(
  deck: DeckContent,
  meta: { title: string },
  fonts: PdfFontSet,
  loadImage: DeckImageLoader,
): Promise<Buffer> {
  const images = await loadDeckImages(deckImageHashes(deck), loadImage);
  const { width, height } = deck.size;
  const doc = new PDFDocument({
    autoFirstPage: false,
    font: null as unknown as string,
    info: { Title: meta.title },
  });
  const output = collect(doc);
  registerFonts(doc, fonts);
  const painter: Painter = {
    doc,
    theme: deckTheme(deck.theme),
    fonts,
    images,
  };
  for (const slide of deck.slides) {
    const resolved = resolveSlide(slide, deck);
    doc.addPage({ size: [width * PT_PER_PX, height * PT_PER_PX], margin: 0 });
    doc.save();
    doc.scale(PT_PER_PX);
    fillPaint(doc, painter.theme, resolved.background, {
      x: 0,
      y: 0,
      w: width,
      h: height,
    });
    for (const item of resolved.items) drawItem(painter, item);
    doc.restore();
  }
  doc.end();
  return output;
}

export function canLoadPdfFont(source: PdfFontSource): boolean {
  try {
    const doc = new PDFDocument({
      autoFirstPage: false,
      font: null as unknown as string,
    });
    doc.registerFont("probe", source.path, source.face);
    doc.font("probe");
    return true;
  } catch {
    return false;
  }
}
