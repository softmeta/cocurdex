import type { DeckColor } from "@cocurdex/shared";
import type { DeckPaintColor, DeckTheme, LinearGradient } from "../theme";
import {
  contentLayouts,
  defineTheme,
  ellipse,
  glow,
  linear,
  pageNumber,
  rect,
} from "./parts";

interface GlowPalette {
  colors: Record<DeckColor, string>;
  tableBorder: string;
  cover: LinearGradient;
  content: LinearGradient;
  warm: DeckPaintColor;
  cool: DeckPaintColor;
}

function glowTheme(palette: GlowPalette): DeckTheme {
  const bar = linear(90, [palette.warm, 0], [palette.cool, 1]);
  const number = pageNumber("muted", "mono");
  const halo = [
    ellipse(760, -260, 720, 720, glow(palette.warm, 0.55)),
    ellipse(-240, 360, 640, 640, glow(palette.cool, 0.4)),
  ];
  const title = { typography: { maxSize: 72, lineHeight: 1.04 } };
  return defineTheme({
    colors: palette.colors,
    tableBorder: palette.tableBorder,
    roles: { title: { maxSize: 46, lineHeight: 1.08 } },
    layouts: {
      cover: {
        background: palette.cover,
        decorations: [...halo, rect(80, 408, 96, 6, bar)],
        slots: { title },
      },
      closing: {
        background: palette.cover,
        decorations: [...halo, rect(592, 408, 96, 6, bar)],
        slots: { title },
      },
      section: {
        background: palette.cover,
        decorations: [
          ellipse(640, 120, 800, 800, glow(palette.warm, 0.45)),
          rect(80, 272, 96, 8, bar),
        ],
      },
      ...contentLayouts(
        {
          background: palette.content,
          decorations: [
            ellipse(900, -360, 720, 720, glow(palette.warm, 0.3)),
            rect(80, 162, 64, 4, bar),
            number,
          ],
        },
        { background: palette.content, decorations: [number] },
      ),
    },
  });
}

export const NEBULA_THEME = glowTheme({
  colors: {
    text: "F4F5FF",
    muted: "A6ABC9",
    accent: "8B7CFF",
    page: "0A0A1F",
    surface: "1B1B3D",
    onAccent: "0A0A1F",
  },
  tableBorder: "34345F",
  cover: linear(135, ["#0A0A1F", 0], ["#1A1147", 0.55], ["#0B2447", 1]),
  content: linear(160, ["#0A0A1F", 0], ["#14123A", 1]),
  warm: "#8B5CF6",
  cool: "#22D3EE",
});

export const EMBER_THEME = glowTheme({
  colors: {
    text: "FFF3EA",
    muted: "CBB3A6",
    accent: "FF7A45",
    page: "120A0A",
    surface: "2A1714",
    onAccent: "120A0A",
  },
  tableBorder: "4A2C24",
  cover: linear(135, ["#120A0A", 0], ["#3B130F", 0.6], ["#1E0B16", 1]),
  content: linear(160, ["#120A0A", 0], ["#24100E", 1]),
  warm: "#FF7A45",
  cool: "#E11D74",
});
