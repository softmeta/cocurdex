import type { DeckTheme } from "../theme";
import {
  contentLayouts,
  defineTheme,
  ellipse,
  pageNumber,
  rect,
} from "./parts";

const COBALT = "#2B2BD9";
const YELLOW = "#FFC928";
const popNumber = pageNumber("accent", "sans");

export const POP_THEME: DeckTheme = defineTheme({
  colors: {
    text: "141414",
    muted: "5C5C5C",
    accent: "FF4B2B",
    page: "FFF7EA",
    surface: "FFE4CC",
    onAccent: "FFFFFF",
  },
  tableBorder: "F2C9A8",
  roles: { title: { maxSize: 52, lineHeight: 1.04 } },
  layouts: {
    cover: {
      background: COBALT,
      decorations: [
        rect(0, 600, 1280, 120, "accent"),
        ellipse(1000, 420, 360, 360, YELLOW),
        rect(80, 112, 64, 12, YELLOW),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 84, lineHeight: 1 } },
        subtitle: { color: "surface" },
      },
    },
    closing: {
      background: COBALT,
      decorations: [
        ellipse(-120, -120, 360, 360, "accent"),
        ellipse(1040, 480, 360, 360, YELLOW),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 80, lineHeight: 1 } },
        subtitle: { color: "surface" },
      },
    },
    section: {
      background: "accent",
      decorations: [
        ellipse(1000, 440, 400, 400, YELLOW),
        rect(80, 272, 96, 12, COBALT),
      ],
      slots: {
        title: { typography: { maxSize: 64 } },
        subtitle: { color: "text" },
      },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          ellipse(1180, -110, 200, 200, YELLOW),
          rect(80, 160, 80, 8, "accent"),
          popNumber,
        ],
      },
      {
        background: "page",
        decorations: [popNumber],
      },
    ),
  },
});

const NAVY = "#0B2545";
const NAVY_LIGHT = "#13315C";
const DIVIDER = "#D3DCE4";
const boardNumber = pageNumber("muted", "sans");

export const BOARDROOM_THEME: DeckTheme = defineTheme({
  colors: {
    text: "0F1B2D",
    muted: "51607A",
    accent: "0E7C7B",
    page: "FFFFFF",
    surface: "EEF3F6",
    onAccent: "FFFFFF",
  },
  tableBorder: "D3DCE4",
  roles: { title: { maxSize: 42, lineHeight: 1.12 } },
  layouts: {
    cover: {
      background: NAVY,
      decorations: [
        rect(880, 0, 400, 720, NAVY_LIGHT),
        rect(880, 0, 6, 720, "accent"),
        rect(80, 408, 72, 6, "accent"),
      ],
      slots: { title: { color: "page" }, subtitle: { color: "surface" } },
    },
    closing: {
      background: NAVY,
      decorations: [
        rect(0, 600, 1280, 120, NAVY_LIGHT),
        rect(604, 408, 72, 6, "accent"),
      ],
      slots: { title: { color: "page" }, subtitle: { color: "surface" } },
    },
    section: {
      background: NAVY,
      decorations: [
        rect(0, 0, 1280, 8, "accent"),
        rect(80, 272, 96, 8, "accent"),
      ],
      slots: { title: { color: "page" }, subtitle: { color: "surface" } },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          rect(80, 164, 1120, 1, DIVIDER),
          rect(80, 162, 48, 4, "accent"),
          rect(80, 674, 12, 12, NAVY),
          boardNumber,
        ],
      },
      { background: "page", decorations: [boardNumber] },
    ),
  },
});
