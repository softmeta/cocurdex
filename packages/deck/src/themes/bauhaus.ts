import type { DeckTheme } from "../theme";
import {
  contentLayouts,
  defineTheme,
  ellipse,
  pageNumber,
  rect,
  rotated,
  sectionNumber,
} from "./parts";

const BLUE = "#1F4E9C";
const YELLOW = "#F2C230";
const bauhausNumber = pageNumber("text", "sans", {
  frame: { x: 80, y: 664, w: 120, h: 32 },
  align: "left",
  size: 15,
});

export const BAUHAUS_THEME: DeckTheme = defineTheme({
  colors: {
    text: "141414",
    muted: "3A3A3A",
    accent: "D23A2B",
    page: "F1EBDD",
    surface: "E4DCC8",
    onAccent: "FFFFFF",
  },
  tableBorder: "CFC6B2",
  roles: { title: { maxSize: 50, lineHeight: 1.02 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        rect(720, 0, 560, 720, BLUE),
        ellipse(720, -280, 560, 560, "accent"),
        ellipse(900, 400, 380, 380, YELLOW),
        rect(720, 280, 180, 180, "text"),
        ellipse(80, 96, 22, 22, "accent"),
        rect(112, 96, 22, 22, BLUE),
        rotated(rect(146, 96, 22, 22, YELLOW), 45),
      ],
      slots: { title: { typography: { maxSize: 96, lineHeight: 1 } } },
    },
    closing: {
      background: BLUE,
      decorations: [
        ellipse(-160, 440, 440, 440, YELLOW),
        rect(1080, 0, 200, 200, "accent"),
        ellipse(1000, 560, 120, 120, "page"),
      ],
      slots: { title: { color: "page" }, subtitle: { color: "page" } },
    },
    section: {
      background: "text",
      decorations: [
        ellipse(640, 80, 560, 560, YELLOW),
        rect(640, 360, 560, 280, "accent"),
        rect(1060, 40, 160, 160, BLUE),
        sectionNumber({ x: 760, y: 120, w: 320, h: 240 }, "decimal", {
          color: "text",
          font: "sans",
          size: 220,
          align: "center",
          bold: true,
        }),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 80, lineHeight: 1.02 } },
        subtitle: { color: "surface" },
      },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          ellipse(1140, -140, 280, 280, "accent"),
          rect(1200, 640, 80, 80, BLUE),
          rect(80, 164, 120, 8, "text"),
          bauhausNumber,
        ],
      },
      { background: "page", decorations: [bauhausNumber] },
    ),
  },
});
