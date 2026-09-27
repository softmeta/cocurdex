import { type RefObject, useEffect, useState } from "react";

export interface PreviewHeading {
  element: HTMLElement;
  key: string;
  level: number;
  text: string;
}

const HEADING_SELECTOR = "h1, h2, h3, h4";
const ACTIVE_HEADING_OFFSET_PX = 80;

function collectHeadings(root: HTMLElement): PreviewHeading[] {
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
    .map((element, index) => ({
      element,
      key: String(index),
      level: Number(element.tagName.slice(1)),
      text: element.textContent?.trim() ?? "",
    }))
    .filter((heading) => heading.text !== "");
}

function findActiveKey(
  scroller: HTMLElement,
  headings: PreviewHeading[],
): string | null {
  const atBottom =
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
  if (atBottom) {
    return headings.at(-1)?.key ?? null;
  }
  const threshold =
    scroller.getBoundingClientRect().top + ACTIVE_HEADING_OFFSET_PX;
  let activeKey = headings[0]?.key ?? null;
  for (const heading of headings) {
    if (heading.element.getBoundingClientRect().top > threshold) {
      break;
    }
    activeKey = heading.key;
  }
  return activeKey;
}

export function usePreviewHeadings(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const [headings, setHeadings] = useState<PreviewHeading[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) {
      return;
    }
    let current: PreviewHeading[] = [];
    let frame = 0;
    const syncActive = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setActiveKey(findActiveKey(scroller, current)),
      );
    };
    const syncHeadings = () => {
      current = collectHeadings(content);
      setHeadings(current);
      syncActive();
    };
    const observer = new MutationObserver(syncHeadings);
    observer.observe(content, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    scroller.addEventListener("scroll", syncActive, { passive: true });
    syncHeadings();
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", syncActive);
      cancelAnimationFrame(frame);
    };
  }, [contentRef, scrollerRef]);

  return { activeKey, headings };
}

export function useIsWiderThan(
  elementRef: RefObject<HTMLElement | null>,
  minWidthPx: number,
) {
  const [isWider, setIsWider] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setIsWider((entry?.contentRect.width ?? 0) >= minWidthPx),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, minWidthPx]);

  return isWider;
}
