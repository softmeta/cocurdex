import { cn } from "@/lib";

const MIN_COLLAPSED_TEXTAREA_WIDTH = 120;
const ATTACH_BUTTON_WIDTH = 36;
const DEFAULT_COMPOSER_GAP = 8;
const WRAPPED_TEXTAREA_TOLERANCE = 1;

function parsePixelValue(value: string, fallback = 0) {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function getSingleLineTextareaHeight(style: CSSStyleDeclaration) {
  const lineHeight = parsePixelValue(style.lineHeight, 24);
  const paddingTop = parsePixelValue(style.paddingTop);
  const paddingBottom = parsePixelValue(style.paddingBottom);

  return lineHeight + paddingTop + paddingBottom;
}

export function getCollapsedPillTextareaWidth(
  composer: HTMLDivElement,
  actionGroup: HTMLDivElement,
) {
  const composerStyle = window.getComputedStyle(composer);
  const horizontalPadding =
    parsePixelValue(composerStyle.paddingLeft) +
    parsePixelValue(composerStyle.paddingRight);
  const contentWidth = composer.clientWidth - horizontalPadding;
  const gap = parsePixelValue(composerStyle.columnGap, DEFAULT_COMPOSER_GAP);

  return Math.max(
    MIN_COLLAPSED_TEXTAREA_WIDTH,
    contentWidth - ATTACH_BUTTON_WIDTH - actionGroup.offsetWidth - gap * 2,
  );
}

export function measureWrappedTextareaHeight({
  source,
  style,
  width,
}: {
  // The live editor element. We clone its rendered content (text plus mention
  // pills) so the collapsed-width estimate matches what the DOM would actually
  // wrap to. Measuring text alone ignores pills and makes the estimate disagree
  // with the real rendered height, which oscillates the expand/collapse state.
  source: HTMLElement;
  style: CSSStyleDeclaration;
  width: number;
}) {
  const mirror = document.createElement("div");

  Object.assign(mirror.style, {
    border: "0",
    boxSizing: style.boxSizing,
    font: style.font,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    overflowWrap: "break-word",
    padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
    pointerEvents: "none",
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    width: `${width}px`,
  });

  mirror.className = source.className;
  mirror.innerHTML = source.innerHTML;
  document.body.appendChild(mirror);

  try {
    return mirror.scrollHeight;
  } finally {
    mirror.remove();
  }
}

export function getNextPillExpandedState({
  collapsedHeight,
  current,
  renderedHeight,
  singleLineHeight,
}: {
  collapsedHeight: number;
  current: boolean;
  renderedHeight: number;
  singleLineHeight: number;
}) {
  const wrappedHeight = singleLineHeight + WRAPPED_TEXTAREA_TOLERANCE;

  if (current) {
    return collapsedHeight > wrappedHeight;
  }

  return renderedHeight > wrappedHeight;
}

export function getPillComposerShapeClassName(isExpanded: boolean) {
  return isExpanded ? "rounded-card" : "rounded-full";
}

// Caption-row chrome for workspace / agent / model / branch. Inherit the
// footer type so competing trigger utilities (text-body, text-2xs, px-2.5)
// cannot make the four items look like different controls.
export function composerFooterControlClassName(className?: string) {
  return cn(
    "h-8 min-w-0 items-center gap-1.5 px-0 font-normal text-inherit shadow-none",
    className,
  );
}
