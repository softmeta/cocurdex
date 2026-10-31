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

const SAGE = "#A9C3A0";
const OCHRE = "#E9B949";
const CREAM = "#F7F5EF";
const botanicalNumber = pageNumber("muted", "serif");

export const BOTANICAL_THEME: DeckTheme = defineTheme({
  colors: {
    text: "1F3D2B",
    muted: "3F5A48",
    accent: "D9774A",
    page: "EEF1EA",
    surface: "DCE5D5",
    onAccent: "1F3D2B",
  },
  tableBorder: "C9D1C2",
  fonts: { heading: "serif", body: "sans" },
  roles: { title: { maxSize: 46, lineHeight: 1.1 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        ellipse(760, 220, 640, 640, SAGE),
        ellipse(920, -120, 460, 460, "accent", 0.9),
        ellipse(700, 420, 300, 300, OCHRE, 0.85),
        ring(1010, 340, 180, 180, line("text", 2)),
        rect(80, 104, 28, 2, "text"),
      ],
      slots: { title: { typography: { maxSize: 88, lineHeight: 1.04 } } },
    },
    closing: {
      background: "text",
      decorations: [
        ellipse(-160, -160, 480, 480, "accent"),
        ellipse(1000, 440, 420, 420, SAGE, 0.9),
      ],
      slots: { title: { color: "page" }, subtitle: { color: "surface" } },
    },
    section: {
      background: "text",
      decorations: [
        ellipse(620, 80, 720, 720, "accent"),
        ellipse(560, 360, 380, 380, OCHRE, 0.9),
        sectionNumber({ x: 820, y: 140, w: 420, h: 320 }, "padded", {
          color: "page",
          font: "serif",
          size: 300,
          align: "right",
          bold: true,
        }),
      ],
      slots: {
        title: { color: "page", typography: { maxSize: 72 } },
        subtitle: { color: "surface" },
      },
    },
    ...contentLayouts(
      {
        background: CREAM,
        decorations: [
          ellipse(-140, 560, 300, 300, SAGE, 0.55),
          ellipse(1150, -70, 180, 180, OCHRE, 0.85),
          rect(80, 164, 48, 3, "accent"),
          botanicalNumber,
        ],
      },
      { background: CREAM, decorations: [botanicalNumber] },
    ),
  },
});
