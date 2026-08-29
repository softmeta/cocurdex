// Platform detection shared across the renderer. Kept separate from feature code
// so both keyboard shortcuts and platform-conditional styling read one source.

export function isMacPlatform() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

// Tag the document with the OS family so CSS can branch on it. macOS suppresses
// native scrollbars entirely (AppKit flashes them on window focus changes, e.g.
// the cmd+shift screenshot shortcut, leaking phantom bars into screenshots),
// while other platforms keep the thin styled native scrollbar.
export function applyPlatformAttribute(
  root: HTMLElement = document.documentElement,
) {
  root.dataset.platform = isMacPlatform() ? "darwin" : "other";
}
