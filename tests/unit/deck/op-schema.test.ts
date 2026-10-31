import { deckOpsSchema } from "@cocurdex/deck";
import { describe, expect, it } from "vitest";

describe("deckOpsSchema", () => {
  it("accepts every op an agent can send", () => {
    const ops = [
      { op: "addSlide", layout: "blank", index: 0 },
      { op: "insertSlides", markdown: "## A" },
      { op: "duplicateSlide", slideId: "s1" },
      { op: "deleteSlide", slideId: "s1" },
      { op: "moveSlide", slideId: "s1", index: 2 },
      { op: "setLayout", slideId: "s1", layout: "two-content" },
      { op: "setText", slideId: "s1", target: "slot:title", markdown: "Hi" },
      {
        op: "setText",
        slideId: "s1",
        target: "element:caption-1",
        paragraphs: [{ runs: [{ text: "Hi" }] }],
      },
      { op: "setNotes", slideId: "s1", notes: "" },
      { op: "setTheme", theme: "sand" },
    ];
    expect(deckOpsSchema.parse(ops)).toEqual(ops);
  });

  it("rejects ambiguous or unknown text sources and targets", () => {
    const base = { op: "setText", slideId: "s1", target: "slot:title" };
    const rejected = [
      base,
      { ...base, markdown: "a", paragraphs: [] },
      { ...base, target: "slot:footer", markdown: "a" },
      { ...base, target: "title", markdown: "a" },
      { op: "setTheme", theme: "neon" },
    ];
    for (const op of rejected) {
      expect(deckOpsSchema.safeParse([op]).success).toBe(false);
    }
    expect(deckOpsSchema.safeParse([]).success).toBe(false);
  });
});
