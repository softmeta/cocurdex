import { type RefObject, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export interface DocumentHeading {
  element: HTMLElement;
  key: string;
  level: number;
  text: string;
}

const HEADING_SELECTOR = "h1, h2, h3, h4";
const ACTIVE_HEADING_OFFSET_PX = 80;
const MIN_OUTLINE_HEADINGS = 3;

/**
 * The rail shows from 896px of container width and the menu below it. The
 * classes are literal so Tailwind can generate them.
 */
export const DOCUMENT_OUTLINE_CONTAINER_CLASS = "@container/outline";
export const DOCUMENT_OUTLINE_MENU_PADDING_CLASS = "@max-[896px]/outline:pe-14";

function collectHeadings(root: HTMLElement): DocumentHeading[] {
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
    .map((element, index) => ({
      element,
      key: String(index),
      level: Number(element.tagName.slice(1)),
      text: element.textContent?.trim() ?? "",
    }))
    .filter((heading) => heading.text !== "");
}

function sameHeadings(a: DocumentHeading[], b: DocumentHeading[]) {
  return (
    a.length === b.length &&
    a.every(
      (heading, index) =>
        heading.element === b[index]?.element &&
        heading.level === b[index]?.level &&
        heading.text === b[index]?.text,
    )
  );
}

function findActiveKey(
  scroller: HTMLElement,
  headings: DocumentHeading[],
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

export function useDocumentOutline(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const [headings, setHeadings] = useState<DocumentHeading[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) {
      return;
    }
    let current: DocumentHeading[] = [];
    let activeFrame = 0;
    const syncActive = () => {
      cancelAnimationFrame(activeFrame);
      activeFrame = requestAnimationFrame(() =>
        setActiveKey(findActiveKey(scroller, current)),
      );
    };
    const syncHeadings = (commit: (update: () => void) => void) => {
      const next = collectHeadings(content);
      if (sameHeadings(current, next)) {
        return;
      }
      current = next;
      commit(() => {
        setHeadings(next);
        setActiveKey(findActiveKey(scroller, next));
      });
    };
    // Mutation callbacks run before the next paint, so committing there keeps
    // a newly mounted document and its outline in the same frame.
    const observer = new MutationObserver(() => syncHeadings(flushSync));
    observer.observe(content, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    scroller.addEventListener("scroll", syncActive, { passive: true });
    syncHeadings((update) => update());
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", syncActive);
      cancelAnimationFrame(activeFrame);
    };
  }, [contentRef, scrollerRef]);

  const visible = headings.length >= MIN_OUTLINE_HEADINGS;
  return { activeKey, headings: visible ? headings : [] };
}
