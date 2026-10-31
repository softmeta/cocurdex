import type { DeckTheme, DecorationSpec } from "../theme";
import {
  contentLayouts,
  defineTheme,
  label,
  line,
  pageNumber,
  rect,
  ring,
  rows,
  sectionNumber,
} from "./parts";

const RULE = "#2B362B";
const DIM = "#4F5F4F";
const scanlines = rows(4, 1, "#FFFFFF", 0.03);
const terminalNumber = pageNumber("muted", "mono");

const windowBar: DecorationSpec[] = [
  ring(80, 84, 12, 12, line("accent", 2)),
  ring(104, 84, 12, 12, line(DIM, 2)),
  ring(128, 84, 12, 12, line(DIM, 2)),
  label({ x: 160, y: 78, w: 400, h: 24 }, "~/slides — zsh", {
    color: "muted",
    font: "mono",
    size: 14,
    align: "left",
  }),
  rect(80, 108, 1120, 1, RULE),
];

export const TERMINAL_THEME: DeckTheme = defineTheme({
  colors: {
    text: "E6F2E6",
    muted: "A9BDA9",
    accent: "5CE07A",
    page: "0C0F0C",
    surface: "161C16",
    onAccent: "0C0F0C",
  },
  tableBorder: "2B362B",
  fonts: { heading: "mono", body: "mono" },
  roles: { title: { maxSize: 44, lineHeight: 1.15 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        scanlines,
        ...windowBar,
        label({ x: 80, y: 128, w: 600, h: 32 }, "$ cat ./title.md", {
          color: "accent",
          font: "mono",
          size: 22,
          align: "left",
        }),
      ],
      slots: { title: { typography: { maxSize: 72, lineHeight: 1.12 } } },
    },
    closing: {
      background: "page",
      decorations: [
        scanlines,
        ...windowBar,
        label({ x: 0, y: 600, w: 1280, h: 32 }, "$ exit", {
          color: "accent",
          font: "mono",
          size: 20,
          align: "center",
        }),
      ],
      slots: { title: { typography: { maxSize: 64 } } },
    },
    section: {
      background: "accent",
      decorations: [
        rows(4, 1, "#000000", 0.06),
        sectionNumber({ x: 560, y: 100, w: 640, h: 460 }, "padded", {
          color: "page",
          font: "mono",
          size: 380,
          align: "right",
          bold: true,
        }),
        label({ x: 80, y: 252, w: 400, h: 32 }, "$ cd ./next", {
          color: "page",
          font: "mono",
          size: 20,
          align: "left",
        }),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 68 } },
        subtitle: { color: "page" },
      },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          rect(80, 164, 1120, 1, RULE),
          label({ x: 80, y: 664, w: 400, h: 32 }, "~/slides  main", {
            color: "muted",
            font: "mono",
            size: 14,
            align: "left",
          }),
          terminalNumber,
        ],
      },
      { background: "page", decorations: [terminalNumber] },
    ),
  },
});
