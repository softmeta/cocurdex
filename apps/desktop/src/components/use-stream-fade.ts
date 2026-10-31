import { type RefObject, useEffect, useLayoutEffect, useState } from "react";
import {
  STREAM_FADE_DURATION_MS,
  STREAM_FADE_TAIL_MS,
} from "./markdown-stream-fade";

const FADE_KEYFRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const FADE_SELECTOR = "[data-stream-fade]";
const BLOCK_SELECTOR = [
  '[data-streamdown="code-block"]',
  '[data-streamdown="horizontal-rule"]',
  '[data-streamdown="image-wrapper"]',
  '[data-streamdown="mermaid-block"]',
  ".katex-display",
].join(",");
const BLOCK_FADE_APPLIED = "block";

function animateFadeElement(element: HTMLElement) {
  const start = element.dataset.streamFade;
  if (!start || element.dataset.streamFadeApplied === start) {
    return;
  }
  for (const animation of element.getAnimations()) {
    animation.cancel();
  }
  element.dataset.streamFadeApplied = start;
  element.animate(FADE_KEYFRAMES, {
    delay: Number(start) - performance.now(),
    duration: STREAM_FADE_DURATION_MS,
    easing: "ease-out",
    fill: "backwards",
  });
}

function animateFadeTree(node: Node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }
  if (node.matches(FADE_SELECTOR)) {
    animateFadeElement(node);
  }
  for (const element of node.querySelectorAll<HTMLElement>(FADE_SELECTOR)) {
    animateFadeElement(element);
  }
}

function animateBlock(element: HTMLElement) {
  if (element.dataset.streamFadeApplied === BLOCK_FADE_APPLIED) {
    return;
  }
  element.dataset.streamFadeApplied = BLOCK_FADE_APPLIED;
  element.animate(FADE_KEYFRAMES, {
    duration: STREAM_FADE_DURATION_MS,
    easing: "ease-out",
    fill: "backwards",
  });
}

function animateAddedBlocks(node: Node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }
  if (node.matches(BLOCK_SELECTOR)) {
    animateBlock(node);
  }
  for (const element of node.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
    animateBlock(element);
  }
}

function animateMutations(records: MutationRecord[]) {
  for (const record of records) {
    if (record.type === "attributes") {
      animateFadeTree(record.target);
      continue;
    }
    for (const node of record.addedNodes) {
      animateFadeTree(node);
      animateAddedBlocks(node);
    }
  }
}

function canAnimateStreamFade() {
  return (
    typeof Element.prototype.animate === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useStreamFadeAnimations(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!active || !root) {
      return;
    }
    if (!canAnimateStreamFade()) {
      return;
    }
    animateFadeTree(root);
    const observer = new MutationObserver(animateMutations);
    observer.observe(root, {
      attributeFilter: ["data-stream-fade"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [active, containerRef]);
}

export function useStreamFadeActive(streaming: boolean) {
  const [lingering, setLingering] = useState(streaming);
  if (streaming && !lingering) {
    setLingering(true);
  }

  useEffect(() => {
    if (streaming || !lingering) {
      return;
    }
    const timer = window.setTimeout(
      () => setLingering(false),
      STREAM_FADE_TAIL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [lingering, streaming]);

  return streaming || lingering;
}
