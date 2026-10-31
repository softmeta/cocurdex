import type { DeckTheme } from "../theme";
import {
  contentLayouts,
  defineTheme,
  ellipse,
  line,
  pageNumber,
  rect,
  ring,
  sectionNumber,
} from "./parts";

const swissNumber = pageNumber("text", "sans");

export const SWISS_THEME: DeckTheme = defineTheme({
  colors: {
    text: "111111",
    muted: "4A4A4A",
    accent: "D7301F",
    page: "F2F0EB",
    surface: "E4DFD3",
    onAccent: "FFFFFF",
  },
  tableBorder: "C9C3B6",
  roles: { title: { maxSize: 48, lineHeight: 1.05 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        ellipse(780, -140, 640, 640, "accent"),
        ring(700, 260, 260, 260, line("text", 2)),
        rect(80, 96, 40, 6, "text"),
        rect(80, 600, 1120, 3, "text"),
      ],
      slots: { title: { typography: { maxSize: 96, lineHeight: 1 } } },
    },
    closing: {
      background: "text",
      decorations: [
        ellipse(-200, 420, 560, 560, "accent"),
        ring(1000, -120, 400, 400, line("page", 2, { opacity: 0.6 })),
        rect(600, 408, 80, 4, "accent"),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 80, lineHeight: 1 } },
        subtitle: { color: "surface" },
      },
    },
    section: {
      background: "accent",
      decorations: [
        sectionNumber({ x: 520, y: -80, w: 700, h: 880 }, "decimal", {
          color: "text",
          font: "sans",
          size: 760,
          align: "right",
          bold: true,
        }),
        rect(80, 272, 64, 6, "onAccent"),
      ],
      slots: {
        title: {
          color: "onAccent",
          typography: { maxSize: 72, lineHeight: 1.02 },
        },
        subtitle: { color: "onAccent" },
      },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          rect(80, 164, 1120, 2, "text"),
          rect(1176, 72, 24, 24, "accent"),
          rect(80, 652, 1120, 1, "text"),
          swissNumber,
        ],
      },
      { background: "page", decorations: [swissNumber] },
    ),
  },
});
