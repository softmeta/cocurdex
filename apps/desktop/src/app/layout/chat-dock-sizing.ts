import { MIN_CHAT_WIDTH } from "./app-shell/panel-geometry";

export const CHAT_DOCK_MIN_WIDTH = MIN_CHAT_WIDTH + 2;
export const PINNED_EDITOR_MIN_WIDTH = 500;

export function resolveChatDockPinLayout(
  viewportWidth: number,
  preferredWidth: number,
) {
  const maximum = viewportWidth - PINNED_EDITOR_MIN_WIDTH;
  return {
    canPin: maximum >= CHAT_DOCK_MIN_WIDTH,
    width: Math.max(CHAT_DOCK_MIN_WIDTH, Math.min(preferredWidth, maximum)),
  };
}
