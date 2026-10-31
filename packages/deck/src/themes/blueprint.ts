import type { DeckTheme, DecorationSpec } from "../theme";
import {
  box,
  contentLayouts,
  defineTheme,
  grid,
  label,
  line,
  pageNumber,
  rect,
  ring,
  rotated,
  sectionNumber,
} from "./parts";

const NAVY = "#072A63";
const fineGrid = grid(16, 1, "text", 0.06);
const majorGrid = grid(80, 1, "text", 0.16);
const navyGrid = grid(80, 1, "text", 0.12);
const blueprintNumber = pageNumber("text", "mono");

const cornerMarks: DecorationSpec[] = [
  rect(40, 40, 28, 2, "text"),
  rect(40, 40, 2, 28, "text"),
  rect(1212, 40, 28, 2, "text"),
  rect(1238, 40, 2, 28, "text"),
  rect(40, 678, 28, 2, "text"),
  rect(40, 652, 2, 28, "text"),
  rect(1212, 678, 28, 2, "text"),
  rect(1238, 652, 2, 28, "text"),
];

function dimension(x: number, y: number, w: number): DecorationSpec[] {
  return [
    rect(x, y, w, 1, "text"),
    rect(x, y - 8, 1, 16, "text"),
    rect(x + w - 1, y - 8, 1, 16, "text"),
  ];
}

export const BLUEPRINT_THEME: DeckTheme = defineTheme({
  colors: {
    text: "FFFFFF",
    muted: "D6E4FF",
    accent: "9CC0FF",
    page: "0B4BB3",
    surface: "1A5BC4",
    onAccent: "072A63",
  },
  tableBorder: "6F9BE0",
  roles: { title: { maxSize: 46, lineHeight: 1.1 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        fineGrid,
        majorGrid,
        ...cornerMarks,
        ring(860, 120, 280, 280, line("text", 2, { opacity: 0.85 })),
        rotated(
          box(
            920,
            180,
            160,
            160,
            line("text", 2, { opacity: 0.6, dashed: true }),
          ),
          45,
        ),
        rect(860, 259, 280, 1, "text", 0.6),
        rect(999, 120, 1, 280, "text", 0.6),
        ...dimension(860, 428, 280),
        label({ x: 940, y: 436, w: 120, h: 24 }, "Ø 280", {
          color: "text",
          font: "mono",
          size: 14,
          align: "center",
        }),
      ],
      slots: { title: { typography: { maxSize: 84, lineHeight: 1.04 } } },
    },
    closing: {
      background: NAVY,
      decorations: [navyGrid, ...cornerMarks],
      slots: { title: { typography: { maxSize: 72 } } },
    },
    section: {
      background: NAVY,
      decorations: [
        navyGrid,
        sectionNumber({ x: 600, y: 100, w: 600, h: 460 }, "padded", {
          color: "text",
          font: "mono",
          size: 400,
          align: "right",
          bold: true,
          hollow: true,
          stroke: { color: "text", width: 2 },
        }),
        ...dimension(640, 600, 560),
      ],
      slots: { title: { typography: { maxSize: 72, lineHeight: 1.06 } } },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          fineGrid,
          rect(80, 164, 1120, 2, "text"),
          blueprintNumber,
        ],
      },
      { background: "page", decorations: [fineGrid, blueprintNumber] },
    ),
  },
});
