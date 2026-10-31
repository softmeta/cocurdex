import { deckTheme } from "@cocurdex/deck";
import { compileDeckMarkdown } from "@cocurdex/deck/markdown";
import type { DeckThemeId } from "@cocurdex/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlideCanvas } from "@/features/decks/slide-canvas";

function textColor(theme: DeckThemeId, text: string): string {
  const { content } = compileDeckMarkdown("## Plan\n- Ship it");
  const themed = { ...content, theme };
  const { getByText } = render(
    <SlideCanvas slide={themed.slides[0]} content={themed} />,
  );
  const block = getByText(text).closest<HTMLElement>("[data-slide-item]");
  return block?.style.color ?? "";
}

function hex(color: string): string {
  return `#${color}`;
}

describe("SlideCanvas", () => {
  it.each<DeckThemeId>(["default", "swiss", "clinic"])(
    "paints slide text with the %s theme colors",
    (theme) => {
      const { colors } = deckTheme(theme);
      const probe = document.createElement("div");
      probe.style.color = hex(colors.text);
      expect(textColor(theme, "Plan")).toBe(probe.style.color);
    },
  );
});
