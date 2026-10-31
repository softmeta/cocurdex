import type { DeckTheme, DecorationSpec } from "../theme";
import {
  box,
  contentLayouts,
  defineTheme,
  line,
  pageNumber,
  radial,
  rect,
  rotated,
  sectionNumber,
} from "./parts";

const GLOW = radial(["#26221B", 0], ["page", 1]);
const noirNumber = pageNumber("accent", "serif");
const goldFrame: DecorationSpec[] = [
  box(32, 32, 1216, 656, line("accent", 1)),
  box(44, 44, 1192, 632, line("accent", 1, { opacity: 0.35 })),
];

function diamond(cx: number, cy: number): DecorationSpec[] {
  return [
    rotated(box(cx - 18, cy - 18, 36, 36, line("accent", 1)), 45),
    rotated(rect(cx - 8, cy - 8, 16, 16, "accent"), 45),
  ];
}

export const NOIR_THEME: DeckTheme = defineTheme({
  colors: {
    text: "F4EFE6",
    muted: "CFC6B4",
    accent: "C9A45C",
    page: "0E0E0F",
    surface: "1E1C19",
    onAccent: "0E0E0F",
  },
  tableBorder: "4A4232",
  fonts: { heading: "serif", body: "serif" },
  roles: { title: { maxSize: 46, bold: false, lineHeight: 1.15 } },
  layouts: {
    cover: {
      background: GLOW,
      decorations: [
        ...goldFrame,
        ...diamond(640, 130),
        rect(560, 410, 160, 1, "accent"),
      ],
      slots: {
        title: {
          align: "center",
          typography: { maxSize: 84, lineHeight: 1.1 },
        },
        subtitle: { align: "center" },
      },
    },
    closing: {
      background: GLOW,
      decorations: [
        ...goldFrame,
        ...diamond(640, 130),
        rect(600, 410, 80, 1, "accent"),
      ],
      slots: { title: { typography: { maxSize: 72 } } },
    },
    section: {
      background: GLOW,
      decorations: [
        sectionNumber({ x: 0, y: 40, w: 1280, h: 640 }, "roman", {
          color: "accent",
          font: "serif",
          size: 480,
          align: "center",
          italic: true,
          hollow: true,
          stroke: { color: "accent", width: 1.5, opacity: 0.55 },
        }),
        rect(600, 284, 80, 1, "accent"),
      ],
      slots: {
        title: { align: "center", typography: { maxSize: 72 } },
        subtitle: { align: "center" },
      },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          rect(80, 164, 1120, 1, "accent"),
          rect(80, 644, 1120, 1, "accent", 0.4),
          noirNumber,
        ],
      },
      { background: "page", decorations: [noirNumber] },
    ),
  },
});
