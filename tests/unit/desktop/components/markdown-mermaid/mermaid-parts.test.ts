import { describe, expect, it } from "vitest";
import {
  collectMermaidParts,
  newMermaidParts,
} from "@/components/markdown-mermaid/mermaid-parts";

function parseSvg(markup: string) {
  return new DOMParser().parseFromString(markup, "image/svg+xml")
    .documentElement;
}

const FIRST_RENDER = `<svg id="cocurdex-mermaid-1" xmlns="http://www.w3.org/2000/svg">
  <marker id="cocurdex-mermaid-1_flowchart-v2-pointEnd"/>
  <g id="cocurdex-mermaid-1-flowchart-Web-0" class="node"><rect/></g>
  <g id="cocurdex-mermaid-1-flowchart-Server-1" class="node"><rect/></g>
</svg>`;

const SECOND_RENDER = `<svg id="cocurdex-mermaid-2" xmlns="http://www.w3.org/2000/svg">
  <marker id="cocurdex-mermaid-2_flowchart-v2-pointEnd"/>
  <g id="cocurdex-mermaid-2-clients" class="cluster">
    <g id="cocurdex-mermaid-2-flowchart-Web-0" class="node"><rect/></g>
  </g>
  <g id="cocurdex-mermaid-2-flowchart-Server-1" class="node"><rect/></g>
  <path id="cocurdex-mermaid-2-L_Web_Server_0" data-id="L_Web_Server_0"/>
  <g class="edgeLabel"><g class="label" data-id="L_Web_Server_0"/></g>
  <g id="cocurdex-mermaid-2-flowchart-Db-4" class="node"><rect/></g>
</svg>`;

function ids(elements: Element[]) {
  return elements.map(
    (element) => element.getAttribute("data-id") ?? element.id,
  );
}

describe("newMermaidParts", () => {
  it("matches parts across renders despite the per-render id prefix", () => {
    const previous = collectMermaidParts(parseSvg(FIRST_RENDER));
    const next = collectMermaidParts(parseSvg(SECOND_RENDER));

    expect(ids(newMermaidParts(next, new Set(previous.keys())))).toEqual([
      "cocurdex-mermaid-2-clients",
      "L_Web_Server_0",
      "L_Web_Server_0",
      "cocurdex-mermaid-2-flowchart-Db-4",
    ]);
  });

  it("fades a new group once instead of also fading its new children", () => {
    const next = collectMermaidParts(parseSvg(SECOND_RENDER));
    const withoutWeb = new Set(
      [...next.keys()].filter(
        (key) => !key.includes("Web-0") && !key.includes("clients"),
      ),
    );

    expect(ids(newMermaidParts(next, withoutWeb))).toEqual([
      "cocurdex-mermaid-2-clients",
    ]);
  });

  it("ignores marker and filter definitions", () => {
    const parts = collectMermaidParts(parseSvg(FIRST_RENDER));

    expect([...parts.keys()].some((key) => key.startsWith("marker"))).toBe(
      false,
    );
  });
});
