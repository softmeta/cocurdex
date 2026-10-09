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

export const STREAM_FADE_DURATION_MS = 500;
const STREAM_FADE_STAGGER_MS = 16;
const STREAM_FADE_MIN_STEP_MS = 1;
const STREAM_FADE_MAX_LAG_MS = 150;
export const STREAM_FADE_TAIL_MS =
  STREAM_FADE_DURATION_MS + STREAM_FADE_MAX_LAG_MS;
const SKIPPED_TAGS = new Set(["annotation", "math", "pre", "svg"]);
const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}`;
const FADE_UNIT = new RegExp(`[${CJK}]|\\s+|[^\\s${CJK}]+`, "gu");
const WHITESPACE = /^\s+$/;

type BlockTimeline = Map<number, number>;

export type StreamFadeState = {
  blocks: Map<number, BlockTimeline>;
  lastStart: number;
};

export function createStreamFadeState(): StreamFadeState {
  return { blocks: new Map(), lastStart: Number.NEGATIVE_INFINITY };
}

function isParent(node: HastNode): node is HastParent {
  return "children" in node && Array.isArray(node.children);
}

function isText(node: HastNode): node is HastText {
  return node.type === "text";
}

function isInlineCode(node: HastNode): node is HastElement {
  return node.type === "element" && (node as HastElement).tagName === "code";
}

function isKatex(element: HastElement) {
  const className = element.properties?.className;
  return Array.isArray(className) && className.includes("katex");
}

function isSkipped(node: HastNode) {
  if (node.type !== "element") {
    return false;
  }
  const element = node as HastElement;
  return SKIPPED_TAGS.has(element.tagName) || isKatex(element);
}

function collectText(node: HastNode): string {
  if (isText(node)) {
    return node.value;
  }
  return isParent(node) ? node.children.map(collectText).join("") : "";
}

function getBlockTimeline(state: StreamFadeState, blockIndex: number) {
  const existing = state.blocks.get(blockIndex);
  if (existing) {
    return existing;
  }
  const block: BlockTimeline = new Map();
  state.blocks.set(blockIndex, block);
  return block;
}

type PendingUnit = { offset: number; properties: Record<string, unknown> };

type FadeContext = {
  block: BlockTimeline;
  now: number;
  pending: PendingUnit[];
};

function scheduleStarts(
  state: StreamFadeState,
  block: BlockTimeline,
  pending: PendingUnit[],
  now: number,
) {
  if (pending.length === 0) {
    return;
  }
  const from = Math.max(now, state.lastStart);
  const room = now + STREAM_FADE_MAX_LAG_MS - from;
  const step = Math.max(
    STREAM_FADE_MIN_STEP_MS,
    Math.min(STREAM_FADE_STAGGER_MS, room / pending.length),
  );
  pending.forEach((unit, index) => {
    const start = Math.round(from + (index + 1) * step);
    block.set(unit.offset, start);
    unit.properties.dataStreamFade = String(start);
    state.lastStart = start;
  });
}

function isFinished(start: number, now: number) {
  return now - start >= STREAM_FADE_DURATION_MS;
}

function fadeProperties(
  offset: number,
  context: FadeContext,
  base: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const start = context.block.get(offset);
  if (start === undefined) {
    const properties = { ...base };
    context.pending.push({ offset, properties });
    return properties;
  }
  return isFinished(start, context.now)
    ? null
    : { ...base, dataStreamFade: String(start) };
}

function splitText(
  value: string,
  offset: number,
  context: FadeContext,
): HastNode[] {
  const nodes: HastNode[] = [];
  let plain = "";
  for (const match of value.matchAll(FADE_UNIT)) {
    const unit = match[0];
    const properties = WHITESPACE.test(unit)
      ? null
      : fadeProperties(offset + match.index, context);
    if (!properties) {
      plain += unit;
      continue;
    }
    if (plain) {
      nodes.push({ type: "text", value: plain });
      plain = "";
    }
    nodes.push({
      type: "element",
      tagName: "span",
      properties,
      children: [{ type: "text", value: unit }],
    });
  }
  if (plain) {
    nodes.push({ type: "text", value: plain });
  }
  return nodes;
}

function fadeInlineCode(
  element: HastElement,
  offset: number,
  context: FadeContext,
): HastElement {
  const properties = fadeProperties(offset, context, element.properties);
  return properties ? { ...element, properties } : element;
}

export function applyStreamFade(
  tree: HastNode,
  state: StreamFadeState,
  blockIndex: number,
  now: number,
) {
  const block = getBlockTimeline(state, blockIndex);
  const context: FadeContext = { block, now, pending: [] };
  let offset = 0;

  const visit = (parent: HastParent) => {
    parent.children = parent.children.flatMap((child) => {
      if (isText(child)) {
        if (WHITESPACE.test(child.value)) {
          return [child];
        }
        const nodes = splitText(child.value, offset, context);
        offset += child.value.length;
        return nodes;
      }
      if (isInlineCode(child)) {
        const faded = fadeInlineCode(child, offset, context);
        offset += collectText(child).length;
        return [faded];
      }
      if (isSkipped(child)) {
        offset += collectText(child).length;
        return [child];
      }
      if (isParent(child)) {
        visit(child);
      }
      return [child];
    });
  };

  if (isParent(tree)) {
    visit(tree);
  }
  scheduleStarts(state, block, context.pending, now);
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
