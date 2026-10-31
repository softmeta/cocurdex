import {
  type DeckTheme,
  deckTheme,
  type ResolvedImage,
  type ResolvedItem,
  type ResolvedTable,
  type ResolvedText,
  resolveSlide,
  TABLE_CELL_PADDING,
  TEXT_INSET,
} from "@cocurdex/deck";
import type { DeckContent, Slide } from "@cocurdex/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib";
import { useDeckImageUrl } from "./deck-image-urls";
import {
  fontStack,
  frameStyle,
  paintCss,
  patternStyle,
  shapeStyle,
  slideLength,
  textEffectStyle,
  themeColor,
} from "./slide-geometry";
import { SlideParagraphs } from "./slide-paragraphs";

const VALIGN_JUSTIFY = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
} as const;

function SlideText({ item, theme }: { item: ResolvedText; theme: DeckTheme }) {
  return (
    <div
      data-slide-item="text"
      className="absolute flex flex-col"
      style={{
        ...frameStyle(item.frame),
        padding: slideLength(TEXT_INSET),
        justifyContent: VALIGN_JUSTIFY[item.valign],
        textAlign: item.align,
        color: themeColor(theme, item.color),
        fontFamily: fontStack(item.font),
        fontSize: slideLength(item.fontSize),
        fontWeight: item.bold ? 700 : 400,
        lineHeight: item.lineHeight,
        ...textEffectStyle(theme, item),
      }}
    >
      <SlideParagraphs paragraphs={item.paragraphs} theme={theme} />
    </div>
  );
}

function SlideTable({
  item,
  theme,
}: {
  item: ResolvedTable;
  theme: DeckTheme;
}) {
  const border = `${slideLength(1)} solid #${theme.tableBorder}`;
  return (
    <div
      data-slide-item="table"
      className="absolute"
      style={{
        ...frameStyle(item.frame),
        height: "auto",
        color: themeColor(theme, "text"),
        fontSize: slideLength(item.fontSize),
        lineHeight: item.lineHeight,
      }}
    >
      <table className="w-full table-fixed border-collapse">
        <tbody>
          {item.table.rows.map((row, rowIndex) => {
            const isHeader = item.table.header && rowIndex === 0;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: table rows have no identity beyond their position
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => {
                  const Cell = isHeader ? "th" : "td";
                  return (
                    <Cell
                      // biome-ignore lint/suspicious/noArrayIndexKey: table cells have no identity beyond their position
                      key={cellIndex}
                      className="text-start align-top"
                      style={{
                        border,
                        padding: slideLength(TABLE_CELL_PADDING),
                        fontWeight: isHeader ? 700 : 400,
                        background: isHeader
                          ? themeColor(theme, "surface")
                          : undefined,
                      }}
                    >
                      <SlideParagraphs
                        paragraphs={cell.paragraphs}
                        theme={theme}
                      />
                    </Cell>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SlideImage({ item }: { item: ResolvedImage }) {
  const url = useDeckImageUrl(item.image.hash);
  if (!url) {
    return (
      <div
        data-slide-item="image"
        role="img"
        aria-label={item.alt}
        className="absolute"
        style={frameStyle(item.frame)}
      />
    );
  }
  return (
    <img
      data-slide-item="image"
      src={url}
      alt={item.alt}
      draggable={false}
      className="absolute object-contain"
      style={frameStyle(item.frame)}
    />
  );
}

function SlideItem({ item, theme }: { item: ResolvedItem; theme: DeckTheme }) {
  if (item.kind === "text") return <SlideText item={item} theme={theme} />;
  if (item.kind === "image") return <SlideImage item={item} />;
  if (item.kind === "table") return <SlideTable item={item} theme={theme} />;
  if (item.kind === "pattern") {
    return (
      <div aria-hidden className="absolute" style={patternStyle(theme, item)} />
    );
  }
  return (
    <div aria-hidden className="absolute" style={shapeStyle(theme, item)} />
  );
}

export function slideItemKey(item: ResolvedItem): string {
  if (item.source.kind === "slot") return `slot:${item.source.slot}`;
  if (item.source.kind === "element") return `element:${item.source.elementId}`;
  return `decoration:${item.source.index}`;
}

export function SlideCanvas({
  slide,
  content,
  className,
  hiddenItemKey,
  children,
}: {
  slide: Slide;
  content: DeckContent;
  className?: string;
  hiddenItemKey?: string | null;
  children?: ReactNode;
}) {
  const theme = deckTheme(content.theme);
  const resolved = resolveSlide(slide, content);
  return (
    <div
      data-slide-id={slide.id}
      className={cn(
        "@container relative aspect-video overflow-hidden",
        className,
      )}
      style={{
        background: paintCss(theme, resolved.background),
        fontFamily: fontStack(theme.fonts.body),
      }}
    >
      {resolved.items.map((item) => {
        const key = slideItemKey(item);
        if (key === hiddenItemKey) return null;
        return <SlideItem key={key} item={item} theme={theme} />;
      })}
      {children}
    </div>
  );
}
