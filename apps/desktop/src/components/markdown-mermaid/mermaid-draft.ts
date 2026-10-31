import type { MermaidRenderResult } from "./mermaid-render";
import type { SizedMermaidSvg } from "./mermaid-svg";
import type { MermaidAppearance } from "./mermaid-theme";

const BLOCK_OPENER = /^\s*(subgraph|loop|alt|opt|par|critical|break|rect)\b/;
const BLOCK_END = /^\s*end\s*$/;

export function mermaidDraftSource(code: string) {
  const end = code.lastIndexOf("\n");
  const lines = code
    .slice(0, Math.max(end, 0))
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 2) {
    return "";
  }

  let openBlocks = 0;
  for (const line of lines) {
    if (BLOCK_OPENER.test(line)) {
      openBlocks += 1;
    } else if (BLOCK_END.test(line) && openBlocks > 0) {
      openBlocks -= 1;
    }
  }
  return [...lines, ...Array.from({ length: openBlocks }, () => "end")].join(
    "\n",
  );
}

interface DraftRequest {
  appearance: MermaidAppearance;
  source: string;
}

export interface MermaidDraftRendererOptions {
  render(
    source: string,
    appearance: MermaidAppearance,
  ): Promise<MermaidRenderResult>;
  wait(ms: number): Promise<void>;
  now(): number;
  onDiagram(diagram: SizedMermaidSvg): void;
}

export function createMermaidDraftRenderer(
  options: MermaidDraftRendererOptions,
) {
  let wanted: DraftRequest | null = null;
  let rendered: DraftRequest | null = null;
  let running = false;
  let attached = false;

  const isRendered = (request: DraftRequest) =>
    rendered?.source === request.source &&
    rendered.appearance === request.appearance;

  async function pump() {
    running = true;
    try {
      while (attached && wanted && !isRendered(wanted)) {
        const request = wanted;
        const startedAt = options.now();
        const result = await options.render(request.source, request.appearance);
        rendered = request;
        if (!attached) {
          return;
        }
        if (result.ok) {
          options.onDiagram(result.diagram);
          await options.wait(options.now() - startedAt);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    attach() {
      attached = true;
      if (!running) {
        void pump();
      }
    },
    detach() {
      attached = false;
    },
    request(source: string, appearance: MermaidAppearance) {
      if (!source) {
        return;
      }
      wanted = { appearance, source };
      if (attached && !running) {
        void pump();
      }
    },
  };
}
