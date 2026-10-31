import type { MermaidAppearance } from "@cocurdex/shared";
import { useCallback, useSyncExternalStore } from "react";
import { diagramPalette } from "./diagram-palette";
import { createDiagramCache } from "./mermaid-cache";
import { cachedDiagram, saveDiagram } from "./mermaid-images";
import { createMermaidRenderer } from "./mermaid-renderer";
import { MONO_FONT } from "./mono-font";
import { renderNativeDiagram } from "./native-mermaid";

export const diagrams = createDiagramCache();

export const mermaidRenderer = createMermaidRenderer({
  known: ({ source, appearance }) => diagrams.get(source, appearance) !== null,
  cached: cachedDiagram,
  save: saveDiagram,
  rendered: ({ source, appearance }, diagram) =>
    diagrams.rendered(source, appearance, diagram),
  failed: ({ source, appearance }) => diagrams.failed(source, appearance),
  renderLocally: ({ source, appearance }) =>
    renderNativeDiagram(source, diagramPalette(appearance), MONO_FONT),
});

export function useDiagram(source: string, appearance: MermaidAppearance) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribe = diagrams.subscribe(listener);
      mermaidRenderer.request({ source, appearance });
      return unsubscribe;
    },
    [source, appearance],
  );
  return useSyncExternalStore(subscribe, () =>
    diagrams.get(source, appearance),
  );
}

export function diagramSource(id: string) {
  return diagrams.sourceOf(id);
}
