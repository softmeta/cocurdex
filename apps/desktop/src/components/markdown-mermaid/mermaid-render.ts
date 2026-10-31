import { createMermaidPlugin } from "@streamdown/mermaid";
import { type SizedMermaidSvg, sizeMermaidSvg } from "./mermaid-svg";
import { type MermaidAppearance, mermaidThemeConfig } from "./mermaid-theme";

export type MermaidRenderResult =
  | { diagram: SizedMermaidSvg; ok: true }
  | { error: string; ok: false };

const MAX_CACHED_RENDERS = 64;
const UNSIZED_OUTPUT_ERROR = "Mermaid returned a diagram without a viewBox";

const mermaidPlugin = createMermaidPlugin();
const results = new Map<string, MermaidRenderResult>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let renderQueue: Promise<void> = Promise.resolve();
let renderCount = 0;

export function mermaidRenderKey(chart: string, appearance: MermaidAppearance) {
  return `${appearance}\n${chart}`;
}

export function readMermaidRender(key: string) {
  return results.get(key);
}

export function subscribeMermaidRenders(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestMermaidRender(
  chart: string,
  appearance: MermaidAppearance,
) {
  const key = mermaidRenderKey(chart, appearance);
  if (results.has(key) || pending.has(key)) {
    return;
  }

  pending.add(key);
  renderQueue = renderQueue
    .then(() => renderChart(chart, appearance))
    .then((result) => {
      storeResult(key, result);
    })
    .finally(() => {
      pending.delete(key);
      for (const listener of listeners) {
        listener();
      }
    });
}

export function renderMermaidDraft(
  chart: string,
  appearance: MermaidAppearance,
): Promise<MermaidRenderResult> {
  const result = renderQueue.then(() => renderChart(chart, appearance));
  renderQueue = result.then(() => undefined);
  return result;
}

async function renderChart(
  chart: string,
  appearance: MermaidAppearance,
): Promise<MermaidRenderResult> {
  renderCount += 1;
  try {
    const mermaid = mermaidPlugin.getMermaid(
      mermaidThemeConfig(
        appearance,
        getComputedStyle(document.body).fontFamily,
      ),
    );
    const { svg } = await mermaid.render(
      `cocurdex-mermaid-${renderCount}`,
      chart,
    );
    const diagram = sizeMermaidSvg(svg);
    return diagram
      ? { diagram, ok: true }
      : { error: UNSIZED_OUTPUT_ERROR, ok: false };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

function storeResult(key: string, result: MermaidRenderResult) {
  results.set(key, result);
  if (results.size > MAX_CACHED_RENDERS) {
    const oldest = results.keys().next().value;
    if (oldest !== undefined) {
      results.delete(oldest);
    }
  }
}
