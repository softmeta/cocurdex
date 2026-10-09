import { describe, expect, it } from "vitest";
import {
  applyStreamFade,
  createStreamFadeState,
  STREAM_FADE_DURATION_MS,
} from "./markdown-stream-fade";

type Node = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

function paragraph(...children: Node[]): Node {
  return {
    type: "root",
    children: [{ type: "element", tagName: "p", children }],
  };
}

function text(value: string): Node {
  return { type: "text", value };
}

function fadedUnits(tree: Node) {
  const units: { start: number; text: string }[] = [];
  const visit = (node: Node) => {
    const start = node.properties?.dataStreamFade;
    if (typeof start === "string") {
      units.push({
        start: Number(start),
        text: node.children?.[0]?.value ?? "",
      });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return units;
}

function render(
  state: ReturnType<typeof createStreamFadeState>,
  now: number,
  ...children: Node[]
) {
  const tree = paragraph(...children);
  applyStreamFade(tree, state, 0, now);
  return tree;
}

describe("applyStreamFade", () => {
  it("fades words and CJK characters as separate staggered units", () => {
    const tree = render(createStreamFadeState(), 1_000, text("Hi there 你好"));

    expect(fadedUnits(tree)).toEqual([
      { start: 1_016, text: "Hi" },
      { start: 1_032, text: "there" },
      { start: 1_048, text: "你" },
      { start: 1_064, text: "好" },
    ]);
  });

  it("keeps each unit's start time when the block re-renders", () => {
    const state = createStreamFadeState();
    render(state, 1_000, text("Hello"));
    const tree = render(state, 1_100, text("Hello world"));

    expect(fadedUnits(tree)).toEqual([
      { start: 1_016, text: "Hello" },
      { start: 1_116, text: "world" },
    ]);
  });

  it("renders finished units as plain text", () => {
    const state = createStreamFadeState();
    render(state, 1_000, text("Hello"));
    const now = 1_016 + STREAM_FADE_DURATION_MS;
    const tree = render(state, now, text("Hello world"));

    expect(fadedUnits(tree)).toEqual([{ start: now + 16, text: "world" }]);
  });

  it("spreads a burst evenly across the lag window in reading order", () => {
    const burst = "字".repeat(100);
    const starts = fadedUnits(
      render(createStreamFadeState(), 0, text(burst)),
    ).map((unit) => unit.start);

    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts.at(-1)).toBe(150);
  });

  it("continues after the previous burst instead of overlapping it", () => {
    const state = createStreamFadeState();
    render(state, 0, text("字".repeat(100)));
    const tree = render(state, 100, text(`${"字".repeat(100)}尾`));

    expect(fadedUnits(tree).at(-1)).toEqual({ start: 166, text: "尾" });
  });

  it("fades inline code as one unit", () => {
    const tree = render(createStreamFadeState(), 0, text("Use "), {
      type: "element",
      tagName: "code",
      children: [text("&mut T")],
    });

    expect(fadedUnits(tree)).toEqual([
      { start: 16, text: "Use" },
      { start: 32, text: "&mut T" },
    ]);
  });

  it("leaves code blocks untouched", () => {
    const tree = render(createStreamFadeState(), 0, {
      type: "element",
      tagName: "pre",
      children: [
        { type: "element", tagName: "code", children: [text("let x = 1;")] },
      ],
    });

    expect(fadedUnits(tree)).toEqual([]);
  });

  it("keeps blocks with the same opening on separate timelines", () => {
    const state = createStreamFadeState();
    applyStreamFade(paragraph(text("字段 用途")), state, 0, 0);
    const tree = paragraph(text("字段 用途"));
    applyStreamFade(tree, state, 1, 1_000);

    expect(fadedUnits(tree).map((unit) => unit.start)).toEqual([
      1_016, 1_032, 1_048, 1_064,
    ]);
  });

  it("leaves rendered KaTeX untouched", () => {
    const tree = render(createStreamFadeState(), 0, {
      type: "element",
      tagName: "span",
      properties: { className: ["katex"] },
      children: [text("x + y")],
    });

    expect(fadedUnits(tree)).toEqual([]);
  });

  it("ignores layout whitespace that appears as a table grows", () => {
    const state = createStreamFadeState();
    render(state, 0, text("项"));
    const tree = render(state, 100, text("\n"), text("项"));

    expect(fadedUnits(tree)).toEqual([{ start: 16, text: "项" }]);
  });
});
