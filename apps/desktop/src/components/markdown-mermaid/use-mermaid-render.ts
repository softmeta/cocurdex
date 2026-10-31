import { useEffect, useState, useSyncExternalStore } from "react";
import { useResolvedTheme } from "@/lib";
import {
  mermaidRenderKey,
  readMermaidRender,
  requestMermaidRender,
  subscribeMermaidRenders,
} from "./mermaid-render";
import type { SizedMermaidSvg } from "./mermaid-svg";
import type { MermaidAppearance } from "./mermaid-theme";
import { useMermaidDraft } from "./use-mermaid-draft";

export function useMermaidRender(chart: string, enabled: boolean) {
  const appearance: MermaidAppearance =
    useResolvedTheme() === "dark" ? "dark" : "light";
  const key = mermaidRenderKey(chart, appearance);
  const draft = useMermaidDraft(chart, appearance, !enabled);
  const result = useSyncExternalStore(subscribeMermaidRenders, () =>
    readMermaidRender(key),
  );

  useEffect(() => {
    if (enabled) {
      requestMermaidRender(chart, appearance);
    }
  }, [chart, appearance, enabled]);

  const [lastDiagram, setLastDiagram] = useState<SizedMermaidSvg | null>(null);
  if (result?.ok && result.diagram !== lastDiagram) {
    setLastDiagram(result.diagram);
  }

  if (result) {
    return result.ok
      ? { diagram: result.diagram, error: null }
      : { diagram: null, error: result.error };
  }
  return { diagram: lastDiagram ?? draft, error: null };
}
