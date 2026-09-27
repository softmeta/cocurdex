// Shared width rule for anchored dropdown popups (Select, Menu, Combobox,
// ContextMenu): no `w-*` so the fixed positioner shrink-wraps to the longest
// row (and caller `w-*` overrides still win), `min-w` keeps the popup at
// least as wide as the trigger (`--anchor-width` is published by the Base UI
// Positioner), and `max-w` caps it so long labels cannot stretch across the
// window. `min-w-(--anchor-width)` sorts before spacing utilities, so caller
// `min-w-*` still overrides it; `--popup-max-width` is the supported way for
// a call site to tighten the cap (e.g. `[--popup-max-width:18rem]`).
export const popupContentWidthClassName =
  "min-w-(--anchor-width) max-w-[min(var(--popup-max-width,420px),calc(100vw-2rem))]";

// Submenu flyouts anchor to a parent row, so the anchor-width floor would
// force them to the parent menu's width: they hug their own rows instead.
export const popupSubContentWidthClassName =
  "max-w-[min(var(--popup-max-width,420px),calc(100vw-2rem))]";
