import { useLayoutEffect, useRef } from "react";
import { collectMermaidParts, newMermaidParts } from "./mermaid-parts";

const FADE_MS = 180;

function fadeInNewParts(
  root: SVGSVGElement,
  previousKeys: ReadonlySet<string>,
) {
  const parts = collectMermaidParts(root);
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!reducedMotion) {
    for (const element of newMermaidParts(parts, previousKeys)) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_MS,
        easing: "ease-out",
      });
    }
  }
  return new Set(parts.keys());
}

export function useMermaidStreamFrame(svg: string | null, streaming: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousKeys = useRef<ReadonlySet<string>>(new Set());
  const tallestHeight = useRef(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const root = container?.querySelector("svg");
    if (!svg || !container || !root) {
      return;
    }
    if (!streaming) {
      previousKeys.current = new Set(collectMermaidParts(root).keys());
      tallestHeight.current = 0;
      container.style.minHeight = "";
      return;
    }
    previousKeys.current = fadeInNewParts(root, previousKeys.current);
    tallestHeight.current = Math.max(
      tallestHeight.current,
      root.getBoundingClientRect().height,
    );
    container.style.minHeight = `${tallestHeight.current}px`;
  }, [svg, streaming]);

  return containerRef;
}
