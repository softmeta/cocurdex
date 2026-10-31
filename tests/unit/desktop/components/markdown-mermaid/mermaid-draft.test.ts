import { describe, expect, it } from "vitest";
import {
  createMermaidDraftRenderer,
  mermaidDraftSource,
} from "@/components/markdown-mermaid/mermaid-draft";
import type { MermaidRenderResult } from "@/components/markdown-mermaid/mermaid-render";
import type { SizedMermaidSvg } from "@/components/markdown-mermaid/mermaid-svg";

function diagramFor(source: string): SizedMermaidSvg {
  return { height: 1, svg: source, width: 1 };
}

function setup(failing: Set<string> = new Set()) {
  const rendered: string[] = [];
  const shown: string[] = [];
  const resolvers: Array<() => void> = [];
  const renderer = createMermaidDraftRenderer({
    render: (source) =>
      new Promise<MermaidRenderResult>((resolve) => {
        rendered.push(source);
        resolvers.push(() =>
          resolve(
            failing.has(source)
              ? { error: "parse error", ok: false }
              : { diagram: diagramFor(source), ok: true },
          ),
        );
      }),
    wait: () => Promise.resolve(),
    now: () => 0,
    onDiagram: (diagram) => shown.push(diagram.svg),
  });
  const finishNext = async () => {
    resolvers.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { finishNext, rendered, renderer, shown };
}

describe("mermaidDraftSource", () => {
  it("drops the line that is still streaming", () => {
    expect(mermaidDraftSource('flowchart LR\n  A --> B\n  C["ha')).toBe(
      "flowchart LR\n  A --> B",
    );
  });

  it("waits for a statement after the diagram header", () => {
    expect(mermaidDraftSource("flowch")).toBe("");
    expect(mermaidDraftSource("flowchart LR\n  A -")).toBe("");
  });

  it("closes blocks that are still open", () => {
    expect(
      mermaidDraftSource(
        "flowchart LR\n  subgraph a\n    subgraph b\n      X\n    end\n    Y\n  Z",
      ),
    ).toBe(
      "flowchart LR\n  subgraph a\n    subgraph b\n      X\n    end\n    Y\nend",
    );
  });
});

describe("createMermaidDraftRenderer", () => {
  it("skips intermediate drafts and renders only the latest one", async () => {
    const { finishNext, rendered, renderer, shown } = setup();
    renderer.attach();

    renderer.request("a", "dark");
    renderer.request("ab", "dark");
    renderer.request("abc", "dark");
    await finishNext();
    await finishNext();

    expect(rendered).toEqual(["a", "abc"]);
    expect(shown).toEqual(["a", "abc"]);
  });

  it("keeps the last good diagram when a draft fails to parse", async () => {
    const { finishNext, renderer, shown } = setup(new Set(["ab"]));
    renderer.attach();

    renderer.request("a", "dark");
    await finishNext();
    renderer.request("ab", "dark");
    await finishNext();

    expect(shown).toEqual(["a"]);
  });

  it("does not render the same draft twice", async () => {
    const { finishNext, rendered, renderer } = setup();
    renderer.attach();

    renderer.request("a", "dark");
    await finishNext();
    renderer.request("a", "dark");

    expect(rendered).toEqual(["a"]);
  });

  it("stops publishing diagrams after detach", async () => {
    const { finishNext, renderer, shown } = setup();
    renderer.attach();

    renderer.request("a", "dark");
    renderer.detach();
    await finishNext();

    expect(shown).toEqual([]);
  });
});
