export const MIN_CHAT_WIDTH = 375;
export const MIN_RIGHT_WIDTH = 460;
export const PANEL_SEPARATOR_WIDTH = 1;
const MIN_SPLIT_WIDTH =
  MIN_CHAT_WIDTH + MIN_RIGHT_WIDTH + PANEL_SEPARATOR_WIDTH;
const SPLIT_RESTORE_BUFFER = 24;

export function resolveCompactPanel(width: number, wasCompact: boolean) {
  const threshold = MIN_SPLIT_WIDTH + (wasCompact ? SPLIT_RESTORE_BUFFER : 0);
  return width < threshold;
}

export function clampPanelWidth(width: number, viewportWidth: number) {
  const maximum = Math.max(
    MIN_RIGHT_WIDTH,
    viewportWidth - MIN_CHAT_WIDTH - PANEL_SEPARATOR_WIDTH,
  );
  return Math.min(Math.max(MIN_RIGHT_WIDTH, width), maximum);
}
