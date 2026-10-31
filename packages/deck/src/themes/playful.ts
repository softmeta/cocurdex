import type { DeckTheme } from "../theme";
import {
  contentLayouts,
  defineTheme,
  dots,
  ellipse,
  line,
  outlined,
  pageNumber,
  ring,
  rotated,
  roundRect,
  sectionNumber,
} from "./parts";

const YELLOW = "#FFC93C";
const MINT = "#3DDC97";
const ink = line("text", 4);
const thickInk = line("text", 5);
const dotted = dots(28, 1.6, "text", 0.12);
const numberBadge = [
  ring(1150, 652, 48, 48, line("text", 3)),
  pageNumber("text", "sans", {
    frame: { x: 1150, y: 652, w: 48, h: 48 },
    align: "center",
    size: 18,
  }),
];

export const PLAYFUL_THEME: DeckTheme = defineTheme({
  colors: {
    text: "17142B",
    muted: "4A4566",
    accent: "FF6B5B",
    page: "FFFFFF",
    surface: "EDE8FF",
    onAccent: "17142B",
  },
  tableBorder: "C9C2E8",
  roles: { title: { maxSize: 50, lineHeight: 1.05 } },
  layouts: {
    cover: {
      background: "surface",
      decorations: [
        dotted,
        outlined(ellipse(820, 400, 520, 520, YELLOW), ink),
        rotated(outlined(roundRect(940, 70, 200, 200, 28, "accent"), ink), 14),
        outlined(ellipse(760, 300, 120, 120, MINT), ink),
      ],
      slots: { title: { typography: { maxSize: 92, lineHeight: 1.02 } } },
    },
    closing: {
      background: "accent",
      decorations: [
        dotted,
        outlined(ellipse(-80, -80, 300, 300, YELLOW), thickInk),
        rotated(
          outlined(roundRect(1060, 500, 200, 200, 32, MINT), thickInk),
          12,
        ),
      ],
      slots: {
        title: { typography: { maxSize: 80, lineHeight: 1.02 } },
        subtitle: { color: "text" },
      },
    },
    section: {
      background: YELLOW,
      decorations: [
        dotted,
        outlined(ellipse(700, 110, 500, 500, "accent"), thickInk),
        sectionNumber({ x: 700, y: 110, w: 500, h: 500 }, "decimal", {
          color: "page",
          font: "sans",
          size: 300,
          align: "center",
          bold: true,
          stroke: { color: "text", width: 5 },
        }),
        rotated(
          outlined(roundRect(640, 520, 140, 140, 24, MINT), thickInk),
          -16,
        ),
      ],
      slots: { title: { typography: { maxSize: 72, lineHeight: 1.04 } } },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          outlined(ellipse(1100, -90, 260, 260, YELLOW), ink),
          rotated(
            outlined(roundRect(1040, 40, 70, 70, 14, "accent"), ink),
            -12,
          ),
          roundRect(80, 160, 88, 12, 6, "accent"),
          ...numberBadge,
        ],
      },
      { background: "page", decorations: numberBadge },
    ),
  },
});
