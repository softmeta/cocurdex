import type { DeckPaintColor, DeckTheme } from "../theme";
import {
  contentLayouts,
  defineTheme,
  ellipse,
  pageNumber,
  rect,
} from "./parts";

const INK = "#0B1220";
const HAIRLINE = "#E3E7EE";

function ring(x: number, y: number, size: number, inner: DeckPaintColor) {
  return [
    ellipse(x, y, size, size, "accent"),
    ellipse(x + 6, y + 6, size - 12, size - 12, inner),
  ];
}

const number = pageNumber("accent", "mono");

export const TECH_THEME: DeckTheme = defineTheme({
  colors: {
    text: "0B1220",
    muted: "5B6475",
    accent: "2F5BFF",
    page: "FFFFFF",
    surface: "F2F4F8",
    onAccent: "FFFFFF",
  },
  tableBorder: "DCE1EA",
  roles: { title: { maxSize: 46, lineHeight: 1.08 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        rect(0, 96, 1280, 1, HAIRLINE),
        rect(0, 624, 1280, 1, HAIRLINE),
        rect(1040, 0, 1, 720, HAIRLINE),
        ...ring(940, -220, 440, "#FFFFFF"),
        rect(80, 128, 14, 14, "accent"),
      ],
      slots: { title: { typography: { maxSize: 72, lineHeight: 1.04 } } },
    },
    closing: {
      background: INK,
      decorations: [
        ...ring(440, 160, 400, INK),
        rect(604, 408, 72, 4, "accent"),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 64 } },
        subtitle: { color: "surface" },
      },
    },
    section: {
      background: INK,
      decorations: [
        ...ring(880, 360, 560, INK),
        rect(80, 272, 96, 8, "accent"),
        rect(0, 624, 1280, 1, "#1E2738"),
      ],
      slots: { title: { color: "page" }, subtitle: { color: "surface" } },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          rect(80, 164, 1120, 1, HAIRLINE),
          rect(80, 163, 64, 3, "accent"),
          number,
        ],
      },
      { background: "page", decorations: [number] },
    ),
  },
});
