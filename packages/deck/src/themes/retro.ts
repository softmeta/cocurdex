import type { DeckPaint, DeckTheme, DecorationSpec } from "../theme";
import {
  contentLayouts,
  defineTheme,
  ellipse,
  pageNumber,
  rect,
  roundRect,
  sectionNumber,
} from "./parts";

const MUSTARD = "#E8A33D";
const OLIVE = "#7C9A6B";
const retroNumber = pageNumber("text", "serif");

function rainbow(
  cx: number,
  cy: number,
  radius: number,
  step: number,
  paints: DeckPaint[],
): DecorationSpec[] {
  return paints.map((paint, index) => {
    const r = radius - index * step;
    return ellipse(cx - r, cy - r, r * 2, r * 2, paint);
  });
}

function stripes(x: number, y: number, w: number, h: number): DecorationSpec[] {
  return (["accent", MUSTARD, OLIVE] as DeckPaint[]).map((paint, index) =>
    roundRect(x + index * (w + 8), y, w, h, h / 2, paint),
  );
}

export const RETRO_THEME: DeckTheme = defineTheme({
  colors: {
    text: "3B2314",
    muted: "6B4E36",
    accent: "A8431F",
    page: "F4E8D0",
    surface: "EADBBE",
    onAccent: "F4E8D0",
  },
  tableBorder: "D9C7A8",
  fonts: { heading: "serif", body: "sans" },
  roles: { title: { maxSize: 50, lineHeight: 1.05 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        ...rainbow(1040, 700, 400, 60, [
          "text",
          "accent",
          MUSTARD,
          OLIVE,
          "page",
        ]),
        ...stripes(80, 88, 40, 8),
      ],
      slots: { title: { typography: { maxSize: 96, lineHeight: 1.02 } } },
    },
    closing: {
      background: "text",
      decorations: rainbow(640, 720, 200, 50, [
        "accent",
        MUSTARD,
        OLIVE,
        "text",
      ]),
      slots: { title: { color: "page" }, subtitle: { color: "surface" } },
    },
    section: {
      background: "accent",
      decorations: [
        rect(0, 600, 1280, 32, MUSTARD),
        rect(0, 632, 1280, 32, OLIVE),
        rect(0, 664, 1280, 56, "text"),
        ellipse(820, 120, 320, 320, "page"),
        sectionNumber({ x: 820, y: 120, w: 320, h: 320 }, "decimal", {
          color: "text",
          font: "serif",
          size: 200,
          align: "center",
        }),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 80 } },
        subtitle: { color: "page" },
      },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          ...rainbow(1230, 50, 150, 40, ["accent", MUSTARD, "page"]),
          ...stripes(80, 160, 28, 6),
          retroNumber,
        ],
      },
      { background: "page", decorations: [retroNumber] },
    ),
  },
});
