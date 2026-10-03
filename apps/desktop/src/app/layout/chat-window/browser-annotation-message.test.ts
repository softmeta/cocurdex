import type { BrowserAnnotation } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { withBrowserAnnotations } from "./browser-annotation-message";

const heading: BrowserAnnotation = {
  id: "a",
  type: "element",
  tagName: "h1",
  selector: "main > h1",
  textContent: "Run a fleet",
  note: "Make it bigger",
  styleChanges: [{ property: "font-size", from: "40px", to: "44px" }],
  boundingBox: { x: 10, y: 20, width: 300, height: 80 },
  pageUrl: "http://localhost:4321/",
  capturedAt: "2026-09-30T00:00:00.000Z",
};

describe("withBrowserAnnotations", () => {
  it("leaves a message untouched without annotations", () => {
    expect(withBrowserAnnotations("hi", [])).toBe("hi");
  });

  it("numbers comments and carries style previews for the agent", () => {
    const region: BrowserAnnotation = {
      ...heading,
      id: "b",
      type: "region",
      note: undefined,
      styleChanges: undefined,
    };
    expect(withBrowserAnnotations("", [heading, region])).toBe(
      [
        "[Browser Annotations]",
        "Page: http://localhost:4321/",
        "Screenshot browser-annotation-N.png shows annotation N.",
        '1. <h1> "Run a fleet"',
        "   Selector: main > h1",
        "   Comment: Make it bigger",
        "   Style preview: font-size 40px → 44px",
        "2. Region 300×80 at (10, 20)",
        "   Selector: main > h1",
      ].join("\n"),
    );
  });

  it("appends the context after the typed message", () => {
    expect(withBrowserAnnotations("Fix these", [heading])).toMatch(
      /^Fix these\n\n\[Browser Annotations\]/,
    );
  });
});
