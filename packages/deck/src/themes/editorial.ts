import type { DeckTheme } from "../theme";
import { contentLayouts, defineTheme, pageNumber, rect } from "./parts";

const editorialNumber = pageNumber("muted", "serif");

export const EDITORIAL_THEME: DeckTheme = defineTheme({
  colors: {
    text: "1C1917",
    muted: "6F675E",
    accent: "B03A2E",
    page: "F6F1E7",
    surface: "ECE4D4",
    onAccent: "F6F1E7",
  },
  tableBorder: "D8CDB8",
  fonts: { heading: "serif", body: "serif" },
  roles: { title: { maxSize: 50, bold: false, lineHeight: 1.1 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        rect(80, 72, 1120, 3, "text"),
        rect(80, 82, 1120, 1, "text"),
        rect(1176, 112, 24, 24, "accent"),
        rect(80, 640, 1120, 1, "text"),
      ],
      slots: { title: { typography: { maxSize: 88, lineHeight: 1.02 } } },
    },
    closing: {
      background: "page",
      decorations: [
        rect(80, 72, 1120, 3, "text"),
        rect(80, 82, 1120, 1, "text"),
        rect(634, 404, 12, 12, "accent"),
        rect(80, 640, 1120, 1, "text"),
      ],
      slots: { title: { typography: { maxSize: 72 } } },
    },
    section: {
      background: "accent",
      decorations: [rect(80, 272, 1120, 1, "onAccent")],
      slots: {
        title: { color: "onAccent", typography: { maxSize: 64 } },
        subtitle: { color: "onAccent" },
      },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          rect(80, 40, 1120, 1, "text"),
          rect(80, 164, 56, 3, "accent"),
          editorialNumber,
        ],
      },
      {
        background: "page",
        decorations: [rect(80, 40, 1120, 1, "text"), editorialNumber],
      },
    ),
  },
});

const NAVY = "accent";
const GOLD = "#C9A227";
const RULE = "#CBD5E1";
const academicNumber = pageNumber("muted", "sans");

export const ACADEMIC_THEME: DeckTheme = defineTheme({
  colors: {
    text: "1B2A41",
    muted: "5A6B82",
    accent: "1F4E8C",
    page: "FFFFFF",
    surface: "EDF2F8",
    onAccent: "FFFFFF",
  },
  tableBorder: "CBD5E1",
  fonts: { heading: "serif", body: "sans" },
  roles: { title: { maxSize: 44, lineHeight: 1.12 } },
  layouts: {
    cover: {
      background: "page",
      decorations: [
        rect(0, 0, 1280, 16, NAVY),
        rect(0, 16, 1280, 4, GOLD),
        rect(80, 640, 1120, 1, RULE),
      ],
      slots: { title: { color: "accent", typography: { maxSize: 64 } } },
    },
    closing: {
      background: NAVY,
      decorations: [rect(604, 408, 72, 4, GOLD)],
      slots: { title: { color: "onAccent" }, subtitle: { color: "surface" } },
    },
    section: {
      background: NAVY,
      decorations: [rect(80, 272, 96, 6, GOLD)],
      slots: { title: { color: "onAccent" }, subtitle: { color: "surface" } },
    },
    ...contentLayouts(
      {
        background: "page",
        decorations: [
          rect(0, 0, 1280, 10, NAVY),
          rect(0, 10, 1280, 3, GOLD),
          rect(80, 656, 1120, 1, RULE),
          academicNumber,
        ],
        slots: { title: { color: "accent" } },
      },
      {
        background: "page",
        decorations: [rect(0, 0, 1280, 10, NAVY), academicNumber],
      },
    ),
  },
});
