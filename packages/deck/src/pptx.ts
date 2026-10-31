import {
  type DeckColor,
  type DeckContent,
  deckImageHashes,
  type SlideLayoutId,
  type TextParagraph,
} from "@cocurdex/shared";
import PptxGenJS from "pptxgenjs";
import { type DeckImageLoader, loadDeckImages } from "./images";
import { SLIDE_LAYOUTS } from "./layouts";
import {
  defineMasters,
  placeholderName,
  points,
  position,
} from "./pptx-masters";
import {
  type ResolvedImage,
  type ResolvedItem,
  type ResolvedTable,
  type ResolvedText,
  resolveSlide,
} from "./resolve";
import { TABLE_CELL_PADDING, TEXT_INSET } from "./text-fit";
import { type DeckTheme, FONT_FACES, solidPaint } from "./theme";
import { deckTheme } from "./themes";

const PARAGRAPH_GAP_EM = 0.3;

type TextProps = PptxGenJS.TextProps;
type Slide = PptxGenJS.Slide;

function color(theme: DeckTheme, token: DeckColor): string {
  return theme.colors[token];
}

function paragraphOptions(paragraph: TextParagraph): TextProps["options"] {
  const options: NonNullable<TextProps["options"]> = {};
  if (paragraph.list === "bullet") options.bullet = true;
  if (paragraph.list === "number") options.bullet = { type: "number" };
  if (paragraph.list) options.indentLevel = paragraph.level ?? 0;
  if (paragraph.align) options.align = paragraph.align;
  return options;
}

function paragraphsToRuns(
  paragraphs: TextParagraph[],
  theme: DeckTheme,
  baseColor: DeckColor,
): TextProps[] {
  const props: TextProps[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const shared = paragraphOptions(paragraph);
    const runs = paragraph.runs.length > 0 ? paragraph.runs : [{ text: "" }];
    runs.forEach((run, runIndex) => {
      const pieces = run.text.split("\n");
      pieces.forEach((piece, pieceIndex) => {
        const isLast =
          runIndex === runs.length - 1 && pieceIndex === pieces.length - 1;
        props.push({
          text: piece,
          options: {
            ...shared,
            bold: run.bold,
            italic: run.italic,
            underline: run.underline ? { style: "sng" } : undefined,
            strike: run.strike ? "sngStrike" : undefined,
            fontFace: run.code ? FONT_FACES.mono : undefined,
            color: color(theme, run.color ?? baseColor),
            hyperlink: run.link ? { url: run.link } : undefined,
            softBreakBefore: pieceIndex > 0 ? true : undefined,
            breakLine:
              isLast && paragraphIndex < paragraphs.length - 1
                ? true
                : undefined,
          },
        });
      });
    });
  });
  return props;
}

function textOptions(item: ResolvedText, theme: DeckTheme) {
  return {
    fontFace: FONT_FACES[item.font],
    fontSize: points(item.fontSize),
    color: color(theme, item.color),
    bold: item.bold,
    align: item.align,
    valign: item.valign,
    lineSpacingMultiple: item.lineHeight,
    paraSpaceAfter: points(item.fontSize * PARAGRAPH_GAP_EM),
    margin: points(TEXT_INSET),
    fit: "shrink" as const,
  };
}

function tableRows(
  item: ResolvedTable,
  theme: DeckTheme,
): PptxGenJS.TableRow[] {
  return item.table.rows.map((row, rowIndex) =>
    row.map((cell) => {
      const isHeader = item.table.header && rowIndex === 0;
      return {
        text: paragraphsToRuns(cell.paragraphs, theme, "text"),
        options: {
          bold: isHeader || undefined,
          fill: isHeader ? { color: color(theme, "surface") } : undefined,
        },
      };
    }),
  );
}

function addTable(slide: Slide, item: ResolvedTable, theme: DeckTheme) {
  const columns = Math.max(1, ...item.table.rows.map((row) => row.length));
  const frame = position(item.frame);
  slide.addTable(tableRows(item, theme), {
    ...frame,
    h: undefined,
    colW: Array.from({ length: columns }, () =>
      Number((frame.w / columns).toFixed(4)),
    ),
    fontFace: FONT_FACES[theme.fonts.body],
    fontSize: points(item.fontSize),
    color: color(theme, "text"),
    valign: "top",
    margin: points(TABLE_CELL_PADDING),
    border: { type: "solid", pt: 0.75, color: theme.tableBorder },
  });
}

function isAtLayoutFrame(layout: SlideLayoutId, item: ResolvedText): boolean {
  if (item.source.kind !== "slot") return false;
  const frame = SLIDE_LAYOUTS[layout].slots[item.source.slot]?.frame;
  return (
    !!frame &&
    frame.x === item.frame.x &&
    frame.y === item.frame.y &&
    frame.w === item.frame.w &&
    frame.h === item.frame.h
  );
}

function isSlideDecoration(
  theme: DeckTheme,
  layout: SlideLayoutId,
  item: ResolvedItem,
): item is ResolvedText {
  if (item.kind !== "text" || item.source.kind !== "decoration") return false;
  const spec = theme.layouts[layout].decorations[item.source.index];
  return spec?.kind === "text";
}

function addLabel(slide: Slide, item: ResolvedText, theme: DeckTheme) {
  const runs = paragraphsToRuns(item.paragraphs, theme, item.color);
  slide.addText(runs, {
    ...textOptions(item, theme),
    ...position(item.frame),
    fit: "none",
    margin: 0,
    lineSpacingMultiple: item.lineHeight,
    italic: item.italic,
    ...(item.hollow ? { transparency: 100 } : {}),
    ...(item.stroke
      ? {
          outline: {
            color: color(theme, item.stroke.color),
            size: points(item.stroke.width),
          },
        }
      : {}),
  });
}

function addImage(
  slide: Slide,
  item: ResolvedImage,
  images: ReadonlyMap<string, Buffer>,
) {
  const bytes = images.get(item.image.hash);
  if (!bytes) return;
  slide.addImage({
    ...position(item.frame),
    data: `${item.image.mimeType};base64,${bytes.toString("base64")}`,
    ...(item.alt ? { altText: item.alt } : {}),
  });
}

function addItem(
  slide: Slide,
  layout: SlideLayoutId,
  item: ResolvedItem,
  theme: DeckTheme,
  images: ReadonlyMap<string, Buffer>,
) {
  if (item.kind === "image") {
    addImage(slide, item, images);
    return;
  }
  if (item.source.kind === "decoration") {
    if (isSlideDecoration(theme, layout, item)) addLabel(slide, item, theme);
    return;
  }
  if (item.kind === "shape") {
    slide.addShape(item.shape, {
      ...position(item.frame),
      fill: item.fill
        ? { color: solidPaint(theme, item.fill) }
        : { type: "none" },
      line: { type: "none" },
    });
    return;
  }
  if (item.kind === "table") {
    addTable(slide, item, theme);
    return;
  }
  if (item.kind === "pattern") return;
  const runs = paragraphsToRuns(item.paragraphs, theme, item.color);
  const options = textOptions(item, theme);
  if (item.source.kind === "slot" && isAtLayoutFrame(layout, item)) {
    slide.addText(runs, {
      ...options,
      placeholder: placeholderName(layout, item.source.slot),
    });
    return;
  }
  slide.addText(runs, { ...options, ...position(item.frame) });
}

export async function exportDeckToPptx(
  deck: DeckContent,
  meta: { title: string },
  loadImage: DeckImageLoader,
): Promise<Buffer> {
  const theme = deckTheme(deck.theme);
  const images = await loadDeckImages(deckImageHashes(deck), loadImage);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = meta.title;
  pptx.theme = {
    headFontFace: FONT_FACES[theme.fonts.heading],
    bodyFontFace: FONT_FACES[theme.fonts.body],
  };
  defineMasters(pptx, theme);
  for (const slide of deck.slides) {
    const resolved = resolveSlide(slide, deck);
    const target = pptx.addSlide({ masterName: slide.layout });
    for (const item of resolved.items) {
      addItem(target, slide.layout, item, theme, images);
    }
    if (resolved.notes) target.addNotes(resolved.notes);
  }
  const output = await pptx.write({
    outputType: "nodebuffer",
    compression: true,
  });
  return output as Buffer;
}
