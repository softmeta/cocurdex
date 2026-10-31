import {
  SLIDE_LAYOUT_IDS,
  SLIDE_SLOT_IDS,
  type SlideFrame,
  type SlideLayoutId,
} from "@cocurdex/shared";
import type PptxGenJS from "pptxgenjs";
import { rasterizeGradient, rasterizePattern } from "./paint-raster";
import { insetForLine } from "./pdf-paint";
import { themedSlotSpec } from "./resolve";
import {
  type DeckPaint,
  type DeckTheme,
  type DecorationSpec,
  FONT_FACES,
  fontForRole,
  isGradient,
  paintHex,
  type ShapeLine,
} from "./theme";

const PX_PER_INCH = 96;
const PT_PER_PX = 0.75;

type MasterObject = NonNullable<PptxGenJS.SlideMasterProps["objects"]>[number];

export function inches(px: number): number {
  return Number((px / PX_PER_INCH).toFixed(4));
}

export function points(px: number): number {
  return Number((px * PT_PER_PX).toFixed(2));
}

export function position(frame: SlideFrame) {
  return {
    x: inches(frame.x),
    y: inches(frame.y),
    w: inches(frame.w),
    h: inches(frame.h),
  };
}

export function placeholderName(layout: SlideLayoutId, slot: string): string {
  return `${layout}-${slot}`;
}

function pngData(png: Buffer): string {
  return `image/png;base64,${png.toString("base64")}`;
}

function transparency(opacity: number | undefined) {
  return opacity === undefined ? {} : { transparency: (1 - opacity) * 100 };
}

type ShapeSpec = Extract<DecorationSpec, { kind: "shape" }>;

export function shapeLine(theme: DeckTheme, line: ShapeLine | undefined) {
  if (!line) return { type: "none" as const };
  return {
    color: paintHex(theme, line.color),
    width: points(line.width),
    ...transparency(line.opacity),
    ...(line.dashed ? { dashType: "dash" as const } : {}),
  };
}

export function shapeOptions(theme: DeckTheme, spec: ShapeSpec) {
  const fill =
    spec.fill === undefined || isGradient(spec.fill)
      ? { type: "none" as const }
      : { color: paintHex(theme, spec.fill), ...transparency(spec.opacity) };
  return {
    ...position(insetForLine(spec.frame, spec.line)),
    fill,
    line: shapeLine(theme, spec.line),
    ...(spec.rotate ? { rotate: spec.rotate } : {}),
    ...(spec.shape === "roundRect"
      ? { rectRadius: inches(spec.radius ?? 0) }
      : {}),
  };
}

function gradientImage(theme: DeckTheme, spec: ShapeSpec): MasterObject[] {
  if (spec.fill === undefined || !isGradient(spec.fill)) return [];
  const { png } = rasterizeGradient(
    theme,
    spec.fill,
    spec.frame,
    spec.shape === "ellipse" ? "ellipse" : "rect",
    spec.opacity,
  );
  return [
    {
      image: {
        ...position(spec.frame),
        data: pngData(png),
        ...(spec.rotate ? { rotate: spec.rotate } : {}),
      },
    },
  ];
}

function shapeObjects(theme: DeckTheme, spec: ShapeSpec): MasterObject[] {
  const images = gradientImage(theme, spec);
  if (images.length > 0 && !spec.line) return images;
  const options = shapeOptions(theme, spec);
  if (spec.shape === "rect") return [...images, { rect: options }];
  return [
    ...images,
    { text: { text: "", options: { ...options, shape: spec.shape } } },
  ];
}

function decorationObjects(
  theme: DeckTheme,
  decoration: DecorationSpec,
): MasterObject[] {
  if (decoration.kind === "shape") return shapeObjects(theme, decoration);
  if (decoration.kind !== "pattern") return [];
  const { png } = rasterizePattern(theme, decoration);
  return [{ image: { ...position(decoration.frame), data: pngData(png) } }];
}

function masterBackground(
  theme: DeckTheme,
  paint: DeckPaint,
): PptxGenJS.BackgroundProps {
  if (!isGradient(paint)) return { color: paintHex(theme, paint) };
  const { png } = rasterizeGradient(theme, paint, {
    x: 0,
    y: 0,
    w: 1280,
    h: 720,
  });
  return { data: pngData(png) };
}

function slideNumber(
  theme: DeckTheme,
  decorations: DecorationSpec[],
): PptxGenJS.SlideNumberProps | undefined {
  const spec = decorations.find((item) => item.kind === "pageNumber");
  if (spec?.kind !== "pageNumber") return undefined;
  return {
    ...position(spec.frame),
    fontFace: FONT_FACES[spec.font],
    fontSize: points(spec.size),
    color: theme.colors[spec.color],
    align: spec.align,
    valign: "middle",
  };
}

export function defineMasters(pptx: PptxGenJS, theme: DeckTheme) {
  for (const layoutId of SLIDE_LAYOUT_IDS) {
    const style = theme.layouts[layoutId];
    const objects: MasterObject[] = style.decorations.flatMap((decoration) =>
      decorationObjects(theme, decoration),
    );
    for (const slot of SLIDE_SLOT_IDS) {
      const spec = themedSlotSpec(theme, layoutId, slot);
      if (!spec) continue;
      objects.push({
        placeholder: {
          options: {
            name: placeholderName(layoutId, slot),
            type: slot === "title" ? "title" : "body",
            ...position(spec.frame),
            fontFace: FONT_FACES[fontForRole(theme, spec.role)],
            fontSize: points(
              spec.typography?.maxSize ?? theme.roles[spec.role].maxSize,
            ),
            color: theme.colors[spec.color],
            align: spec.align,
            valign: spec.valign,
          },
          text: "",
        },
      });
    }
    const number = slideNumber(theme, style.decorations);
    pptx.defineSlideMaster({
      title: layoutId,
      background: masterBackground(theme, style.background),
      objects,
      ...(number ? { slideNumber: number } : {}),
    });
  }
}
