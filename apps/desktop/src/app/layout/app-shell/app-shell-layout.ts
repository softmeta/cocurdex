import { hasMacTrafficLights } from "@/lib/platform";

export const TITLEBAR_HEIGHT = 32;

export const TITLEBAR_ICON_BUTTON_SIZE = 24;
export const TITLEBAR_ICON_BUTTON_GAP = 4;

export const TITLEBAR_LEADING_RESERVE = hasMacTrafficLights() ? 80 : 12;

export function withTitlebarControlsInset(px: number): string {
  return `calc(${px}px + var(--titlebar-controls-inset))`;
}
export const TITLEBAR_CONTROL_COUNT = 5;
export const TITLEBAR_CONTROL_SIZE = TITLEBAR_ICON_BUTTON_SIZE;
export const TITLEBAR_RIGHT_PADDING = 0;
export const TITLEBAR_SIDEBAR_END_INSET = 7;

export const TITLEBAR_TOOLBAR_MIN_WIDTH =
  TITLEBAR_LEADING_RESERVE +
  TITLEBAR_CONTROL_COUNT * TITLEBAR_CONTROL_SIZE +
  (TITLEBAR_CONTROL_COUNT - 1) * TITLEBAR_ICON_BUTTON_GAP +
  TITLEBAR_RIGHT_PADDING;

export const TITLEBAR_PANE_HEADER_START_INSET =
  TITLEBAR_TOOLBAR_MIN_WIDTH + TITLEBAR_ICON_BUTTON_GAP;

export const MIN_SIDEBAR_CONTENT_WIDTH = 200;

export const MIN_LEFT = Math.max(
  TITLEBAR_TOOLBAR_MIN_WIDTH + TITLEBAR_SIDEBAR_END_INSET,
  MIN_SIDEBAR_CONTENT_WIDTH,
);

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
