import { STREAM_TEXT_FADE_MS } from "@cocurdex/shared";
import type { StreamdownProps } from "streamdown";

type RehypePlugins = NonNullable<StreamdownProps["rehypePlugins"]>;
type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
};
type HastParent = { type: string; children: HastNode[] };
type HastNode = HastText | HastElement | { type: string };
type FadeRange = { from: number; to: number; start: number };
type BlockTimeline = { length: number; ranges: FadeRange[] };

export const STREAM_FADE_DURATION_MS = STREAM_TEXT_FADE_MS;
export const STREAM_FADE_TAIL_MS = STREAM_FADE_DURATION_MS;
const SKIPPED_TAGS = new Set(["annotation", "math", "pre", "svg"]);
const WHITESPACE = /^\s+$/;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export type StreamFadeState = { blocks: Map<number, BlockTimeline> };

export function createStreamFadeState(): StreamFadeState {
  return { blocks: new Map() };
}

function isParent(node: HastNode): node is HastParent {
  return "children" in node && Array.isArray(node.children);
}

function isText(node: HastNode): node is HastText {
  return node.type === "text";
}

function isSkipped(node: HastNode) {
  if (node.type !== "element") return false;
  const element = node as HastElement;
  const className = element.properties?.className;
  return (
    SKIPPED_TAGS.has(element.tagName) ||
    (Array.isArray(className) && className.includes("katex"))
  );
}

function textLength(node: HastNode): number {
  if (isText(node)) return WHITESPACE.test(node.value) ? 0 : node.value.length;
  return isParent(node)
    ? node.children.reduce((sum, child) => sum + textLength(child), 0)
    : 0;
}

function splitText(
  value: string,
  offset: number,
  ranges: FadeRange[],
): HastNode[] {
  const nodes: HastNode[] = [];
  const boundaries = [...GRAPHEMES.segment(value)].map((part) => part.index);
  boundaries.push(value.length);
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(0, range.from - offset);
    const end = Math.min(value.length, range.to - offset);
    if (end <= start) continue;
    const from = Math.max(
      cursor,
      boundaries.findLast((boundary) => boundary <= start) ?? 0,
    );
    const to = boundaries.find((boundary) => boundary >= end) ?? value.length;
    if (to <= from) continue;
    if (from > cursor)
      nodes.push({ type: "text", value: value.slice(cursor, from) });
    nodes.push({
      type: "element",
      tagName: "span",
      properties: { dataStreamFade: String(range.start) },
      children: [{ type: "text", value: value.slice(from, to) }],
    });
    cursor = to;
  }
  if (cursor < value.length)
    nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes;
}

export function applyStreamFade(
  tree: HastNode,
  state: StreamFadeState,
  blockIndex: number,
  now: number,
) {
  const block = state.blocks.get(blockIndex) ?? { length: 0, ranges: [] };
  const length = textLength(tree);
  block.ranges = block.ranges.filter(
    (range) =>
      now - range.start < STREAM_FADE_DURATION_MS && range.from < length,
  );
  if (length > block.length) {
    block.ranges.push({ from: block.length, to: length, start: now });
  }
  block.length = length;
  state.blocks.set(blockIndex, block);
  let offset = 0;
  const visit = (parent: HastParent) => {
    parent.children = parent.children.flatMap((child) => {
      if (isText(child)) {
        if (WHITESPACE.test(child.value)) return [child];
        const nodes = splitText(child.value, offset, block.ranges);
        offset += child.value.length;
        return nodes;
      }
      if (isSkipped(child)) {
        offset += textLength(child);
        return [child];
      }
      if (isParent(child)) visit(child);
      return [child];
    });
  };
  if (isParent(tree)) visit(tree);
}

let pluginId = 0;

function createBlockFadePlugin(state: StreamFadeState, blockIndex: number) {
  const rehypeStreamFade = () => (tree: HastNode) => {
    applyStreamFade(tree, state, blockIndex, performance.now());
  };
  pluginId += 1;
  Object.defineProperty(rehypeStreamFade, "name", {
    value: `rehypeStreamFade${pluginId}`,
  });
  return rehypeStreamFade;
}

export type StreamFadeBlockPlugins = (
  blockIndex: number,
  base: RehypePlugins,
) => RehypePlugins;

export function createStreamFadeBlockPlugins(): StreamFadeBlockPlugins {
  const state = createStreamFadeState();
  const cache = new Map<
    number,
    { base: RehypePlugins; plugins: RehypePlugins }
  >();
  return (blockIndex, base) => {
    const cached = cache.get(blockIndex);
    if (cached?.base === base) {
      return cached.plugins;
    }
    const plugin = createBlockFadePlugin(state, blockIndex);
    const plugins = [...base, plugin];
    cache.set(blockIndex, { base, plugins });
    return plugins;
  };
}
