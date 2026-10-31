import { describe, expect, it } from "vitest";
import { sizeMermaidSvg } from "@/components/markdown-mermaid/mermaid-svg";

const FLOWCHART_SVG =
  '<svg id="m1" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 752.4px;" viewBox="-8 -8 752.4 131.6" role="graphics-document document"><g></g></svg>';

describe("sizeMermaidSvg", () => {
  it("reads the natural size from the viewBox", () => {
    const sized = sizeMermaidSvg(FLOWCHART_SVG);

    expect(sized?.width).toBe(752.4);
    expect(sized?.height).toBe(131.6);
  });

  it("replaces responsive sizing with the natural pixel size", () => {
    const sized = sizeMermaidSvg(FLOWCHART_SVG);

    expect(sized?.svg).toBe(
      '<svg width="752.4" height="131.6" id="m1" xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 752.4 131.6" role="graphics-document document"><g></g></svg>',
    );
  });

  it("only rewrites the root svg element", () => {
    const sized = sizeMermaidSvg(
      '<svg viewBox="0 0 10 20" height="20"><rect width="5" height="5" style="fill:red"/></svg>',
    );

    expect(sized?.svg).toBe(
      '<svg width="10" height="20" viewBox="0 0 10 20"><rect width="5" height="5" style="fill:red"/></svg>',
    );
  });

  it("accepts comma separated viewBox values", () => {
    expect(sizeMermaidSvg('<svg viewBox="0,0,40,30"></svg>')).toMatchObject({
      height: 30,
      width: 40,
    });
  });

  it("rejects output without a usable viewBox", () => {
    expect(sizeMermaidSvg("<div></div>")).toBeNull();
    expect(sizeMermaidSvg('<svg width="10"></svg>')).toBeNull();
    expect(sizeMermaidSvg('<svg viewBox="0 0 0 10"></svg>')).toBeNull();
  });
});
