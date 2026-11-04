import type { RightPanelView } from "../right-editor-panel-store";

export interface PanelLocation {
  view: RightPanelView;
  entityId: string | null;
}

export interface AppLocation {
  sessionId: string | null;
  panel: PanelLocation;
}

export interface NavigationHistory {
  entries: readonly AppLocation[];
  index: number;
}

export type NavigationDirection = "back" | "forward";

export const MAX_HISTORY_ENTRIES = 100;

export const EMPTY_HISTORY: NavigationHistory = { entries: [], index: -1 };

export function panelLocationsEqual(left: PanelLocation, right: PanelLocation) {
  return left.view === right.view && left.entityId === right.entityId;
}

export function locationsEqual(left: AppLocation, right: AppLocation) {
  return (
    left.sessionId === right.sessionId &&
    panelLocationsEqual(left.panel, right.panel)
  );
}

export function currentLocation(history: NavigationHistory) {
  return history.entries[history.index] ?? null;
}

export function recordLocation(
  history: NavigationHistory,
  location: AppLocation,
): NavigationHistory {
  const current = currentLocation(history);
  if (current && locationsEqual(current, location)) {
    return history;
  }
  const kept = history.entries.slice(0, history.index + 1);
  const entries = [...kept, location].slice(-MAX_HISTORY_ENTRIES);
  return { entries, index: entries.length - 1 };
}

export function replaceCurrentLocation(
  history: NavigationHistory,
  location: AppLocation,
): NavigationHistory {
  if (history.index < 0) {
    return recordLocation(history, location);
  }
  const entries = history.entries.map((entry, index) =>
    index === history.index ? location : entry,
  );
  return { entries, index: history.index };
}

export function canNavigate(
  history: NavigationHistory,
  direction: NavigationDirection,
) {
  return direction === "back"
    ? history.index > 0
    : history.index < history.entries.length - 1;
}

export function stepHistory(
  history: NavigationHistory,
  direction: NavigationDirection,
): NavigationHistory | null {
  if (!canNavigate(history, direction)) {
    return null;
  }
  const delta = direction === "back" ? -1 : 1;
  return { entries: history.entries, index: history.index + delta };
}
