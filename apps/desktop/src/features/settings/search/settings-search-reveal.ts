const HIT_ATTRIBUTE = "data-settings-search-hit";
const WAIT_FOR_ANCHOR_MS = 3000;

let cancelPendingReveal: (() => void) | null = null;

function findAnchor(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-settings-search-id="${CSS.escape(id)}"]`,
  );
}

function flash(anchor: HTMLElement) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  anchor.scrollIntoView({
    block: "center",
    behavior: reduceMotion ? "auto" : "smooth",
  });
  anchor.removeAttribute(HIT_ATTRIBUTE);
  void anchor.offsetWidth;
  anchor.setAttribute(HIT_ATTRIBUTE, "");
  anchor.addEventListener(
    "animationend",
    () => anchor.removeAttribute(HIT_ATTRIBUTE),
    { once: true },
  );
}

function resolveAnchor(id: string, fallbackId: string | undefined) {
  const anchor = findAnchor(id);
  if (anchor) return anchor;
  return fallbackId ? findAnchor(fallbackId) : null;
}

export function revealSettingsSearchTarget(id: string, fallbackId?: string) {
  cancelPendingReveal?.();
  cancelPendingReveal = null;
  for (const previous of document.querySelectorAll(`[${HIT_ATTRIBUTE}]`)) {
    previous.removeAttribute(HIT_ATTRIBUTE);
  }

  const existing = resolveAnchor(id, fallbackId);
  if (existing) {
    flash(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const anchor = resolveAnchor(id, fallbackId);
    if (!anchor) return;
    stop();
    flash(anchor);
  });
  const timeout = window.setTimeout(() => stop(), WAIT_FOR_ANCHOR_MS);
  const stop = () => {
    observer.disconnect();
    window.clearTimeout(timeout);
    if (cancelPendingReveal === stop) cancelPendingReveal = null;
  };
  observer.observe(document.body, { childList: true, subtree: true });
  cancelPendingReveal = stop;
}
