import { withoutReversedMarkers } from "@cocurdex/mobile/internal/markdown/svg-markers";
import { describe, expect, it } from "vitest";

const SVG = [
  "<svg>",
  '<defs><marker class="arrow" id="inherit" refX="1" refY="2.5" orient="auto-start-reverse"><path d="M0 0"/></marker></defs>',
  '<path marker-start="url(#inherit)" marker-end="url(#inherit)"/>',
  "</svg>",
].join("");

describe("withoutReversedMarkers", () => {
  it("replaces auto-start-reverse with a forward marker and a turned copy for line starts", () => {
    const svg = withoutReversedMarkers(SVG);
    expect(svg).not.toContain("auto-start-reverse");
    expect(svg).toContain(
      '<marker class="arrow" id="inherit" refX="1" refY="2.5" orient="auto"><path d="M0 0"/></marker>',
    );
    expect(svg).toContain(
      '<marker class="arrow" id="inherit--reversed" refX="1" refY="2.5" orient="auto"><g transform="rotate(180 1 2.5)"><path d="M0 0"/></g></marker>',
    );
    expect(svg).toContain(
      'marker-start="url(#inherit--reversed)" marker-end="url(#inherit)"',
    );
  });

  it("leaves SVGs without reversed markers untouched", () => {
    const svg = '<svg><marker id="a" orient="auto"/></svg>';
    expect(withoutReversedMarkers(svg)).toBe(svg);
  });
});
