import type { MermaidAppearance } from "@cocurdex/client-runtime";
import type { RenderedDiagram } from "./mermaid-cache";
import { diagrams, mermaidRenderer } from "./mermaid-store";

export type BridgedDiagram = Pick<RenderedDiagram, "svg" | "width" | "height">;

type Pending = { source: string; appearance: MermaidAppearance };

export function createDiagramBridge(
  deliver: (id: number, diagram: BridgedDiagram | null) => void,
) {
  const pending = new Map<number, Pending>();
  let unsubscribe: (() => void) | null = null;

  function flush() {
    for (const [id, { source, appearance }] of pending) {
      const entry = diagrams.get(source, appearance);
      if (!entry) continue;
      pending.delete(id);
      const { diagram } = entry.kind === "rendered" ? entry : { diagram: null };
      deliver(
        id,
        diagram
          ? { svg: diagram.svg, width: diagram.width, height: diagram.height }
          : null,
      );
    }
    if (pending.size > 0) return;
    unsubscribe?.();
    unsubscribe = null;
  }

  return {
    request(
      requests: readonly { id: number; source: string }[],
      appearance: MermaidAppearance,
    ) {
      for (const { id, source } of requests) {
        pending.set(id, { source, appearance });
        mermaidRenderer.request({ source, appearance });
      }
      unsubscribe ??= diagrams.subscribe(flush);
      flush();
    },
  };
}
