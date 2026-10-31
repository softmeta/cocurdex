import { useEffect, useState } from "react";
import {
  createMermaidDraftRenderer,
  mermaidDraftSource,
} from "./mermaid-draft";
import { renderMermaidDraft } from "./mermaid-render";
import type { SizedMermaidSvg } from "./mermaid-svg";
import type { MermaidAppearance } from "./mermaid-theme";

export function useMermaidDraft(
  code: string,
  appearance: MermaidAppearance,
  streaming: boolean,
) {
  const [draft, setDraft] = useState<SizedMermaidSvg | null>(null);
  const [renderer] = useState(() =>
    createMermaidDraftRenderer({
      render: renderMermaidDraft,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => performance.now(),
      onDiagram: setDraft,
    }),
  );

  useEffect(() => {
    renderer.attach();
    return () => renderer.detach();
  }, [renderer]);

  useEffect(() => {
    if (streaming) {
      renderer.request(mermaidDraftSource(code), appearance);
    }
  }, [renderer, code, appearance, streaming]);

  return draft;
}
