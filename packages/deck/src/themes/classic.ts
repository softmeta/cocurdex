import type { DeckColor } from "@cocurdex/shared";
import type { DeckTheme } from "../theme";
import { contentLayouts, defineTheme, pageNumber, rect } from "./parts";

const COVER_TITLE = { typography: { maxSize: 68, lineHeight: 1.05 } };

function classic(
  colors: Record<DeckColor, string>,
  tableBorder: string,
): DeckTheme {
  const number = pageNumber("muted", "sans");
  return defineTheme({
    colors,
    tableBorder,
    layouts: {
      cover: {
        background: "page",
        decorations: [rect(80, 408, 72, 6, "accent")],
        slots: { title: COVER_TITLE },
      },
      closing: {
        background: "page",
        decorations: [rect(604, 408, 72, 6, "accent")],
        slots: { title: COVER_TITLE },
      },
      section: {
        background: "surface",
        decorations: [rect(80, 272, 96, 8, "accent")],
      },
      ...contentLayouts(
        {
          background: "page",
          decorations: [rect(80, 160, 48, 4, "accent"), number],
        },
        { background: "page", decorations: [number] },
      ),
    },
  });
}

export const CLASSIC_THEMES = {
  default: classic(
    {
      text: "111827",
      muted: "586170",
      accent: "2563EB",
      page: "FFFFFF",
      surface: "F3F4F6",
      onAccent: "FFFFFF",
    },
    "D9DEE5",
  ),
  midnight: classic(
    {
      text: "E6EDF3",
      muted: "9BA6B2",
      accent: "6E8BFF",
      page: "0F141B",
      surface: "1C2430",
      onAccent: "0F141B",
    },
    "3A4655",
  ),
  sand: classic(
    {
      text: "2B2118",
      muted: "75665A",
      accent: "B4471B",
      page: "FBF7F0",
      surface: "F0E7DA",
      onAccent: "FFFFFF",
    },
    "DCCDBA",
  ),
  forest: classic(
    {
      text: "17251D",
      muted: "56675C",
      accent: "1E6B47",
      page: "FFFFFF",
      surface: "EAF2EC",
      onAccent: "FFFFFF",
    },
    "C9D8CD",
  ),
};
