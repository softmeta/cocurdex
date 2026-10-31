import type { DeckContent, DeckIssue, SlideSlotId } from "@cocurdex/shared";
import { SLIDE_LAYOUTS } from "./layouts";
import { type ResolvedSource, resolveSlide } from "./resolve";

function describe(source: ResolvedSource): string {
  switch (source.kind) {
    case "slot":
      return `slot:${source.slot}`;
    case "element":
      return `element:${source.elementId}`;
    case "decoration":
      return `decoration:${source.index}`;
  }
}

export function checkDeck(deck: DeckContent): DeckIssue[] {
  const issues: DeckIssue[] = [];
  deck.slides.forEach((slide, slideIndex) => {
    const push = (kind: DeckIssue["kind"], target: string, message: string) =>
      issues.push({ slideId: slide.id, slideIndex, kind, target, message });
    const layoutSlots = SLIDE_LAYOUTS[slide.layout].slots;
    const slotIds = Object.keys(slide.slots) as SlideSlotId[];
    for (const slot of slotIds) {
      if (!layoutSlots[slot]) {
        push(
          "unknown-slot",
          `slot:${slot}`,
          `Layout "${slide.layout}" has no "${slot}" slot, so its content is hidden`,
        );
      }
    }
    if (slotIds.length === 0 && slide.elements.length === 0) {
      push("empty-slide", "slide", "Slide has no content");
    }
    for (const item of resolveSlide(slide, deck).items) {
      if ((item.kind === "text" || item.kind === "table") && item.overflow) {
        push(
          "overflow",
          describe(item.source),
          "Content does not fit at the smallest font size; shorten it or split the slide",
        );
      }
    }
  });
  return issues;
}
