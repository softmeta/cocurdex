const THEME_CHANGED_EVENT = "cocurdex:theme-changed";

/**
 * Announce that theme mode / preset / fonts have been applied to the document.
 *
 * Surfaces that paint outside CSS (canvas-based terminals, for one) need a
 * repaint on every theme change, but calling into them directly would drag
 * their renderer into the startup bundle even when nothing has been opened
 * yet. They subscribe when they load instead; before that there is nothing to
 * repaint.
 */
export function emitThemeChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT));
}

export function onThemeChanged(listener: () => void) {
  window.addEventListener(THEME_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener(THEME_CHANGED_EVENT, listener);
  };
}
