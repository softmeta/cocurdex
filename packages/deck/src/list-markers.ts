import type { TextParagraph } from "@cocurdex/shared";

const BULLET_GLYPHS = ["•", "–", "◦"];

export function listMarkers(paragraphs: TextParagraph[]): (string | null)[] {
  const counters: number[] = [];
  return paragraphs.map((paragraph) => {
    if (!paragraph.list) {
      counters.length = 0;
      return null;
    }
    const level = paragraph.level ?? 0;
    counters.length = level + 1;
    if (paragraph.list === "bullet") {
      counters[level] = 0;
      return BULLET_GLYPHS[level % BULLET_GLYPHS.length] ?? "•";
    }
    counters[level] = (counters[level] ?? 0) + 1;
    return `${counters[level]}.`;
  });
}
