import type {
  DeckColor,
  SlideFrame,
  SlideLayoutId,
  SlideSlotId,
  TextRole,
} from "@cocurdex/shared";
import type { RoleTypography, TextAlign } from "./theme";

export interface SlotSpec {
  frame: SlideFrame;
  role: TextRole;
  color: DeckColor;
  align: TextAlign;
  valign: "top" | "middle" | "bottom";
  typography?: Partial<RoleTypography>;
}

export interface LayoutSpec {
  slots: Partial<Record<SlideSlotId, SlotSpec>>;
}

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;
export const MARGIN_X = 80;
export const CONTENT_WIDTH = 1120;
const BODY_TOP = 176;
const BODY_HEIGHT = 480;
const COLUMN_WIDTH = 528;

const TITLE: SlotSpec = {
  frame: { x: MARGIN_X, y: 48, w: CONTENT_WIDTH, h: 104 },
  role: "title",
  color: "text",
  align: "left",
  valign: "bottom",
};

const BODY: SlotSpec = {
  frame: { x: MARGIN_X, y: BODY_TOP, w: CONTENT_WIDTH, h: BODY_HEIGHT },
  role: "body",
  color: "text",
  align: "left",
  valign: "top",
};

function titleSlide(align: TextAlign): LayoutSpec {
  return {
    slots: {
      title: {
        frame: { x: MARGIN_X, y: 160, w: CONTENT_WIDTH, h: 240 },
        role: "title",
        color: "text",
        align,
        valign: "bottom",
        typography: { maxSize: 64, minSize: 36, lineHeight: 1.1 },
      },
      subtitle: {
        frame: { x: MARGIN_X, y: 424, w: CONTENT_WIDTH, h: 160 },
        role: "subtitle",
        color: "muted",
        align,
        valign: "top",
      },
    },
  };
}

export const SLIDE_LAYOUTS: Record<SlideLayoutId, LayoutSpec> = {
  cover: titleSlide("left"),
  closing: titleSlide("center"),
  section: {
    slots: {
      title: {
        frame: { x: MARGIN_X, y: 300, w: CONTENT_WIDTH, h: 140 },
        role: "title",
        color: "text",
        align: "left",
        valign: "top",
        typography: { maxSize: 56, minSize: 32, lineHeight: 1.1 },
      },
      subtitle: {
        frame: { x: MARGIN_X, y: 456, w: CONTENT_WIDTH, h: 120 },
        role: "subtitle",
        color: "muted",
        align: "left",
        valign: "top",
      },
    },
  },
  "title-content": { slots: { title: TITLE, body: BODY } },
  "two-content": {
    slots: {
      title: TITLE,
      left: { ...BODY, frame: { ...BODY.frame, w: COLUMN_WIDTH } },
      right: {
        ...BODY,
        frame: {
          ...BODY.frame,
          x: MARGIN_X + CONTENT_WIDTH - COLUMN_WIDTH,
          w: COLUMN_WIDTH,
        },
      },
    },
  },
  "title-only": { slots: { title: TITLE } },
  blank: { slots: {} },
};
