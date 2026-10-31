import type { DeckTheme } from "../theme";
import {
  contentLayouts,
  defineTheme,
  ellipse,
  pageNumber,
  rect,
  sectionNumber,
} from "./parts";

const zenNumber = pageNumber("muted", "serif");

export const ZEN_THEME: DeckTheme = defineTheme({
  colors: {
    text: "1B1B1B",
    muted: "5C574E",
    accent: "C8372D",
    page: "F5F1E8",
    surface: "EBE5D8",
    onAccent: "F5F1E8",
  },
  tableBorder: "D6CFC0",
  fonts: { heading: "serif", body: "sans" },
  roles: { title: { maxSize: 44, bold: false, lineHeight: 1.2 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        ellipse(860, 140, 300, 300, "accent"),
        rect(1180, 80, 1, 520, "text", 0.25),
        rect(80, 104, 40, 2, "accent"),
        rect(80, 640, 1120, 1, "text"),
      ],
      slots: { title: { typography: { maxSize: 80, lineHeight: 1.15 } } },
    },
    closing: {
      background: "page",
      decorations: [
        ellipse(600, 64, 80, 80, "accent"),
        rect(600, 410, 80, 1, "text"),
      ],
      slots: { title: { typography: { maxSize: 64 } } },
    },
    section: {
      background: "text",
      decorations: [
        ellipse(540, 160, 400, 400, "accent"),
        sectionNumber({ x: 940, y: 440, w: 260, h: 200 }, "padded", {
          color: "page",
          font: "serif",
          size: 160,
          align: "right",
        }),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 68 } },
        subtitle: { color: "surface" },
      },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          ellipse(1168, 72, 32, 32, "accent"),
          rect(80, 164, 40, 2, "accent"),
          rect(80, 652, 1120, 1, "text", 0.25),
          zenNumber,
        ],
      },
      { background: "page", decorations: [zenNumber] },
    ),
  },
});
