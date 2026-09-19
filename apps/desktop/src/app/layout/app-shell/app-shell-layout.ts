/**
 * Shared layout metrics for the app shell.
 *
 * The titlebar toolbar (sidebar toggle, back, forward) is rendered inside a
 * box clamped to the sidebar width in `app-shell-frame.tsx`. If the sidebar
 * can shrink below the toolbar's intrinsic width, the trailing forward arrow
 * overflows past the sidebar separator. Deriving `MIN_LEFT` from the toolbar
 * footprint keeps every control visible at the narrowest sidebar.
 */

// Keep electron `trafficLightPosition.y` centered in this height:
// y ≈ (TITLEBAR_HEIGHT - 14) / 2 = 9 for ~14px macOS lights (see main.ts).
export const TITLEBAR_HEIGHT = 32;

/**
 * Shared footprint for every top-chrome icon control (left nav, view switcher
 * tabs, right toggles). size-6 + gap-1 — see `titlebar-icon-button.tsx`.
 */
export const TITLEBAR_ICON_BUTTON_SIZE = 24;
export const TITLEBAR_ICON_BUTTON_GAP = 4;

// Left padding reserved for the macOS traffic lights. Lights end ~59px from
// the edge at trafficLightPosition.x:12; 80px leaves a comfortable gap before
// the first size-6 pill (matches the former settings `left-20` spacing).
export const TITLEBAR_TRAFFIC_LIGHT_RESERVE = 80;
// Number of square controls in the titlebar toolbar: toggle, back, forward.
export const TITLEBAR_CONTROL_COUNT = 3;
export const TITLEBAR_CONTROL_SIZE = TITLEBAR_ICON_BUTTON_SIZE;
// No trailing padding: gap-1 between pills already spaces the cluster; the
// sidebar separator sits at the box edge.
export const TITLEBAR_RIGHT_PADDING = 0;

/** Intrinsic width the titlebar toolbar needs to render without overflow. */
export const TITLEBAR_TOOLBAR_MIN_WIDTH =
  TITLEBAR_TRAFFIC_LIGHT_RESERVE +
  TITLEBAR_CONTROL_COUNT * TITLEBAR_CONTROL_SIZE +
  (TITLEBAR_CONTROL_COUNT - 1) * TITLEBAR_ICON_BUTTON_GAP +
  TITLEBAR_RIGHT_PADDING;

/**
 * Absolute top-right titlebar cluster: proxy status / maximize / panel / settings.
 * Keep ViewSwitcherTabs trailing reserve and pinned chat pe in sync.
 */
export const TITLEBAR_EDITOR_TOGGLE_BUTTON_SIZE = TITLEBAR_ICON_BUTTON_SIZE;
export const TITLEBAR_EDITOR_TOGGLE_GAP = TITLEBAR_ICON_BUTTON_GAP;
export const TITLEBAR_EDITOR_TOGGLE_PAD_X = 24; // px-3
export const TITLEBAR_EDITOR_TOGGLE_COUNT = 4;
export const TITLEBAR_EDITOR_TOGGLE_WIDTH =
  TITLEBAR_EDITOR_TOGGLE_PAD_X +
  TITLEBAR_EDITOR_TOGGLE_COUNT * TITLEBAR_EDITOR_TOGGLE_BUTTON_SIZE +
  (TITLEBAR_EDITOR_TOGGLE_COUNT - 1) * TITLEBAR_EDITOR_TOGGLE_GAP;

/**
 * Leading inset for a pane header that shares the titlebar row while the
 * left rail is hidden: the toolbar box still owns the leading edge, so pane
 * chrome starts one pill-gap after it.
 */
export const TITLEBAR_PANE_HEADER_START_INSET =
  TITLEBAR_TOOLBAR_MIN_WIDTH + TITLEBAR_ICON_BUTTON_GAP;

/** Minimum sidebar width; never narrower than the titlebar toolbar. */
export const MIN_LEFT = TITLEBAR_TOOLBAR_MIN_WIDTH;

/**
 * Absolute max for the session/left sidebar. Layout remaining-space clamp can
 * still go lower on narrow windows; this stops a wide drag from eating the
 * center column (matches chat-dock session-list max).
 */
export const MAX_LEFT = 400;

export interface RightPanelVisibility {
  shouldShow: boolean;
  isGlobal: boolean;
}

export function resolveRightPanelVisibility(params: {
  isOpen: boolean;
  isMaximized: boolean;
}): RightPanelVisibility {
  const shouldShow = params.isOpen;
  const isGlobal = shouldShow && params.isMaximized;
  return { shouldShow, isGlobal };
}

export function resolvePanelFullWidth(params: {
  isPanelOpen: boolean;
  isMaximized: boolean;
  isCompact: boolean;
  isChatDetached: boolean;
}): boolean {
  if (!params.isPanelOpen) {
    return false;
  }
  return params.isMaximized || params.isCompact || params.isChatDetached;
}
