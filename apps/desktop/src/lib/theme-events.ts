const THEME_CHANGED_EVENT = "cocurdex:theme-changed";

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
