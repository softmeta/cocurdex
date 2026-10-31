import {
  type DeckFont,
  type DeckPaint,
  type DeckPaintColor,
  type DeckTheme,
  isGradient,
  paintHex,
  type ResolvedPattern,
  type ResolvedShape,
  type ResolvedText,
} from "@cocurdex/deck";
import type { DeckColor, SlideFrame } from "@cocurdex/shared";
import type { CSSProperties } from "react";

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;
const CJK_SANS = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"';
const FONT_STACKS: Record<DeckFont, string> = {
  sans: `"Helvetica Neue", Arial, ${CJK_SANS}, sans-serif`,
  serif: `Georgia, "Times New Roman", ${CJK_SANS}, serif`,
  mono: `ui-monospace, Menlo, Consolas, "Courier New", ${CJK_SANS}, monospace`,
};

export function slideLength(px: number): string {
  return `${((px / SLIDE_WIDTH) * 100).toFixed(4)}cqw`;
}

export function frameStyle(frame: SlideFrame): CSSProperties {
  return {
    left: `${(frame.x / SLIDE_WIDTH) * 100}%`,
    top: `${(frame.y / SLIDE_HEIGHT) * 100}%`,
    width: `${(frame.w / SLIDE_WIDTH) * 100}%`,
    height: `${(frame.h / SLIDE_HEIGHT) * 100}%`,
  };
}

export function themeColor(theme: DeckTheme, token: DeckColor): string {
  return `#${theme.colors[token]}`;
}

export function rgba(
  theme: DeckTheme,
  color: DeckPaintColor,
  opacity = 1,
): string {
  const hex = paintHex(theme, color);
  const channel = (offset: number) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16);
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${opacity})`;
}

export function paintCss(theme: DeckTheme, paint: DeckPaint): string {
  if (!isGradient(paint)) return `#${paintHex(theme, paint)}`;
  const stops = paint.stops
    .map(
      (stop) =>
        `${rgba(theme, stop.color, stop.opacity)} ${(stop.at * 100).toFixed(1)}%`,
    )
    .join(", ");
  if (paint.kind === "linear") {
    return `linear-gradient(${paint.angle}deg, ${stops})`;
  }
  return `radial-gradient(closest-side, ${stops})`;
}

export function fontStack(font: DeckFont): string {
  return FONT_STACKS[font];
}

const SHAPE_RADIUS = { rect: undefined, ellipse: "50%" } as const;

export function shapeStyle(
  theme: DeckTheme,
  item: ResolvedShape,
): CSSProperties {
  const { line } = item;
  return {
    ...frameStyle(item.frame),
    boxSizing: "border-box",
    background:
      item.fill === undefined ? undefined : paintCss(theme, item.fill),
    opacity: item.opacity,
    borderRadius:
      item.shape === "roundRect"
        ? slideLength(item.radius ?? 0)
        : SHAPE_RADIUS[item.shape],
    border: line
      ? `${slideLength(line.width)} ${line.dashed ? "dashed" : "solid"} ${rgba(theme, line.color, line.opacity)}`
      : undefined,
    transform: item.rotate ? `rotate(${item.rotate}deg)` : undefined,
  };
}

function patternLayers(theme: DeckTheme, item: ResolvedPattern): string[] {
  const color = rgba(theme, item.color, item.opacity);
  const size = slideLength(item.size);
  if (item.pattern === "dots") {
    return [`radial-gradient(circle, ${color} ${size}, transparent ${size})`];
  }
  const rows = `linear-gradient(${color} ${size}, transparent ${size})`;
  if (item.pattern === "rows") return [rows];
  return [
    rows,
    `linear-gradient(90deg, ${color} ${size}, transparent ${size})`,
  ];
}

export function patternStyle(
  theme: DeckTheme,
  item: ResolvedPattern,
): CSSProperties {
  const tile = slideLength(item.spacing);
  return {
    ...frameStyle(item.frame),
    backgroundImage: patternLayers(theme, item).join(", "),
    backgroundSize: `${tile} ${tile}`,
  };
}

export function textEffectStyle(
  theme: DeckTheme,
  item: ResolvedText,
): CSSProperties {
  const { stroke } = item;
  const style: CSSProperties = {};
  if (item.italic) style.fontStyle = "italic";
  if (item.hollow) style.color = "transparent";
  if (stroke) {
    const strokeColor = rgba(theme, stroke.color, stroke.opacity);
    style.WebkitTextStroke = `${slideLength(stroke.width)} ${strokeColor}`;
  }
  if (item.source.kind === "decoration") style.whiteSpace = "nowrap";
  return style;
}
