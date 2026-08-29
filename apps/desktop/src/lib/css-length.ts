/**
 * Read a CSS custom property that resolves to a length in px
 * (e.g. `--app-ui-font-size: 13px`). Used by non-CSS surfaces (Monaco, xterm)
 * that need a numeric font size but must track Appearance settings.
 */
export function readCssVarPx(varName: string, fallback: number): number {
  if (typeof document === "undefined") {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
