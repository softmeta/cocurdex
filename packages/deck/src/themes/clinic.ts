import type { DeckTheme, DecorationSpec } from "../theme";
import {
  contentLayouts,
  defineTheme,
  ellipse,
  pageNumber,
  roundRect,
  sectionNumber,
} from "./parts";

const TEAL = "#14A090";
const MIST = "#CFE3E1";
const PALE = "#F5FAF9";
const WHITE = "#FFFFFF";

function plus(cx: number, cy: number, size: number): DecorationSpec[] {
  const bar = size * 0.44;
  return [
    roundRect(cx - bar / 2, cy - size / 2, bar, size, bar / 4, TEAL),
    roundRect(cx - size / 2, cy - bar / 2, size, bar, bar / 4, TEAL),
  ];
}

const pageBadge: DecorationSpec[] = [
  roundRect(1150, 660, 50, 32, 16, "surface"),
  pageNumber("accent", "sans", {
    frame: { x: 1150, y: 660, w: 50, h: 32 },
    align: "center",
    size: 14,
  }),
];

export const CLINIC_THEME: DeckTheme = defineTheme({
  colors: {
    text: "0F2E33",
    muted: "4C6669",
    accent: "0B6E66",
    page: "FFFFFF",
    surface: "E3F4F2",
    onAccent: "FFFFFF",
  },
  tableBorder: "CFE3E1",
  roles: { title: { maxSize: 46, lineHeight: 1.1 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        roundRect(760, 80, 440, 560, 48, "surface"),
        roundRect(840, 160, 280, 180, 28, "page"),
        roundRect(868, 192, 120, 12, 6, MIST),
        roundRect(868, 224, 200, 12, 6, MIST),
        roundRect(868, 270, 80, 40, 20, TEAL),
        ellipse(920, 400, 200, 200, TEAL, 0.16),
        ...plus(1020, 500, 108),
      ],
      slots: { title: { typography: { maxSize: 80, lineHeight: 1.1 } } },
    },
    closing: {
      background: "accent",
      decorations: [
        ellipse(-120, 480, 360, 360, WHITE, 0.08),
        roundRect(1040, -60, 300, 300, 48, WHITE, 0.08),
      ],
      slots: { title: { color: "page" }, subtitle: { color: "surface" } },
    },
    section: {
      background: "accent",
      decorations: [
        roundRect(700, 100, 520, 520, 64, WHITE, 0.08),
        roundRect(780, 180, 360, 360, 48, WHITE, 0.1),
        sectionNumber({ x: 780, y: 180, w: 360, h: 360 }, "padded", {
          color: "page",
          font: "sans",
          size: 200,
          align: "center",
          bold: true,
        }),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 68 } },
        subtitle: { color: "surface" },
      },
    },
    ...contentLayouts(
      {
        background: PALE,
        decorations: [roundRect(80, 160, 64, 6, 3, TEAL), ...pageBadge],
      },
      { background: PALE, decorations: pageBadge },
    ),
  },
});
