export const chatLayoutModes = ["center", "float", "pinned"] as const;
export type ChatLayoutMode = (typeof chatLayoutModes)[number];

export const CHAT_LAYOUT_STORAGE_KEY = "cocurdex.chat.layout";
const LAST_DOCK_LAYOUT_STORAGE_KEY = "cocurdex.chat.lastDockLayout";
const LEFT_WIDTH_STORAGE_KEY = "cocurdex.shell.leftWidth";
const RIGHT_WIDTH_STORAGE_KEY = "cocurdex.shell.rightWidth";

const LEGACY_PINNED_STORAGE_KEY = "cocurdex.chatDock.pinned";

export type ChatDockLayoutMode = "float" | "pinned";

export function isChatLayoutMode(
  value: string | null,
): value is ChatLayoutMode {
  return value === "center" || value === "float" || value === "pinned";
}

export function getStoredChatLayoutMode(): ChatLayoutMode {
  if (typeof window === "undefined") {
    return "center";
  }

  const stored = window.localStorage.getItem(CHAT_LAYOUT_STORAGE_KEY);
  if (isChatLayoutMode(stored)) {
    return stored;
  }

  if (window.localStorage.getItem(LEGACY_PINNED_STORAGE_KEY) === "true") {
    return "pinned";
  }

  return "center";
}

export function getStoredLastDockLayout(): ChatDockLayoutMode {
  if (typeof window === "undefined") {
    return "float";
  }

  const stored = window.localStorage.getItem(LAST_DOCK_LAYOUT_STORAGE_KEY);
  if (stored === "float" || stored === "pinned") {
    return stored;
  }

  const layout = getStoredChatLayoutMode();
  if (layout === "pinned" || layout === "float") {
    return layout;
  }
  if (window.localStorage.getItem(LEGACY_PINNED_STORAGE_KEY) === "true") {
    return "pinned";
  }
  return "float";
}

export function persistChatLayoutMode(mode: ChatLayoutMode): void {
  window.localStorage.setItem(CHAT_LAYOUT_STORAGE_KEY, mode);
  if (mode === "float" || mode === "pinned") {
    window.localStorage.setItem(LAST_DOCK_LAYOUT_STORAGE_KEY, mode);
  }
  window.localStorage.setItem(
    LEGACY_PINNED_STORAGE_KEY,
    String(mode === "pinned"),
  );
}

export function isEditorFullscreenLayout(mode: ChatLayoutMode): boolean {
  return mode === "float" || mode === "pinned";
}

export function isPinnedChatLayout(mode: ChatLayoutMode): boolean {
  return mode === "pinned";
}

export type ChatLayoutApplySource =
  | "settings"
  | "maximize"
  | "pin"
  | "panel-close";

export function shouldOpenDockWhenApplyingLayout(
  mode: ChatLayoutMode,
  source: ChatLayoutApplySource,
): boolean {
  if (!isEditorFullscreenLayout(mode)) {
    return false;
  }
  return source === "settings";
}

function readStoredWidth(key: string): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getStoredLeftWidth(): number | null {
  return readStoredWidth(LEFT_WIDTH_STORAGE_KEY);
}

export function getStoredRightWidth(): number | null {
  return readStoredWidth(RIGHT_WIDTH_STORAGE_KEY);
}

export function persistLeftWidth(width: number): void {
  window.localStorage.setItem(
    LEFT_WIDTH_STORAGE_KEY,
    String(Math.round(width)),
  );
}

export function persistRightWidth(width: number): void {
  window.localStorage.setItem(
    RIGHT_WIDTH_STORAGE_KEY,
    String(Math.round(width)),
  );
}
