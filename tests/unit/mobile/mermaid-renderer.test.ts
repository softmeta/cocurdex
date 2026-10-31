import type { RenderedDiagram } from "@cocurdex/mobile/internal/markdown/mermaid-cache";
import {
  createMermaidRenderer,
  type DiagramJob,
} from "@cocurdex/mobile/internal/markdown/mermaid-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const START_DELAY_MS = 400;
const TIMEOUT_MS = 5_000;

function diagramOf(svg: string): RenderedDiagram {
  return { svg, width: 10, height: 5, image: null };
}

function setup(
  diskCache = new Map<string, RenderedDiagram>(),
  local: (job: DiagramJob) => string | null = () => null,
) {
  const known = new Set<string>();
  const results: string[] = [];
  const sent: string[] = [];
  const keyOf = (job: DiagramJob) => `${job.appearance}:${job.source}`;
  const renderer = createMermaidRenderer({
    known: (job) => known.has(keyOf(job)),
    cached: async (job) => diskCache.get(keyOf(job)) ?? null,
    save: async (_job, { svg }) => diagramOf(svg),
    rendered: (job, diagram) => {
      known.add(keyOf(job));
      results.push(`${keyOf(job)}=${diagram.svg}`);
    },
    failed: (job) => {
      known.add(keyOf(job));
      results.push(`${keyOf(job)}=failed`);
    },
    renderLocally: (job) => {
      const svg = local(job);
      return svg ? { svg, width: 10, height: 5, png: null } : null;
    },
    startDelayMs: START_DELAY_MS,
    timeoutMs: TIMEOUT_MS,
  });
  const sentId = (index: number) =>
    JSON.parse(sent[index].slice(sent[index].indexOf("(") + 1, -7)).id;
  return { renderer, results, sent, sentId };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createMermaidRenderer", () => {
  it("serves a diagram from the disk cache without starting a renderer", async () => {
    const { renderer, results } = setup(
      new Map([["dark:graph TD", diagramOf("<svg>cached</svg>")]]),
    );
    renderer.request({ source: "graph TD", appearance: "dark" });
    await vi.runAllTimersAsync();
    expect(results).toEqual(["dark:graph TD=<svg>cached</svg>"]);
    expect(renderer.isActive()).toBe(false);
  });

  it("draws supported diagrams locally and sends only the rest to the web renderer", async () => {
    const { renderer, results, sent } = setup(undefined, (job) =>
      job.source === "native" ? "<svg>local</svg>" : null,
    );
    renderer.request({ source: "native", appearance: "light" });
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual(["light:native=<svg>local</svg>"]);
    expect(renderer.isActive()).toBe(false);

    renderer.request({ source: "pie", appearance: "light" });
    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(renderer.isActive()).toBe(true);
    renderer.attach((script) => sent.push(script));
    expect(sent[0]).toContain('"source":"pie"');
  });

  it("starts the renderer after a delay and renders queued diagrams one at a time", async () => {
    const { renderer, results, sent, sentId } = setup();
    const onActive = vi.fn();
    renderer.subscribe(onActive);
    renderer.request({ source: "a", appearance: "light" });
    renderer.request({ source: "b", appearance: "light" });
    renderer.request({ source: "a", appearance: "light" });
    await vi.advanceTimersByTimeAsync(START_DELAY_MS - 1);
    expect(renderer.isActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(renderer.isActive()).toBe(true);
    expect(onActive).toHaveBeenCalledOnce();

    renderer.attach((script) => sent.push(script));
    expect(sent).toHaveLength(1);
    const first = sentId(0);
    renderer.receive({
      type: "rendered",
      id: first,
      svg: "<svg>a</svg>",
      width: 10,
      height: 5,
      png: null,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(2);
    renderer.receive({ type: "error", id: sentId(1) });
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual(["light:a=<svg>a</svg>", "light:b=failed"]);
  });

  it("ignores a reply for a request it no longer waits for", async () => {
    const { renderer, results, sent } = setup();
    renderer.request({ source: "a", appearance: "light" });
    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    renderer.attach((script) => sent.push(script));
    renderer.receive({ type: "error", id: "stale" });
    expect(results).toEqual([]);
  });

  it("fails a diagram whose render never answers and moves on", async () => {
    const { renderer, results, sent } = setup();
    renderer.request({ source: "a", appearance: "light" });
    renderer.request({ source: "b", appearance: "light" });
    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    renderer.attach((script) => sent.push(script));
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(results).toEqual(["light:a=failed"]);
    expect(sent).toHaveLength(2);
  });

  it("resends the interrupted diagram when the renderer process restarts", async () => {
    const { renderer, results, sent, sentId } = setup();
    renderer.request({ source: "a", appearance: "light" });
    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    renderer.attach((script) => sent.push(script));
    renderer.detach();
    renderer.attach((script) => sent.push(script));
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('"source":"a"');
    renderer.receive({
      type: "rendered",
      id: sentId(1),
      svg: "<svg>a</svg>",
      width: 10,
      height: 5,
      png: null,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual(["light:a=<svg>a</svg>"]);
  });
});
