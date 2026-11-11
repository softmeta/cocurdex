import {
  normalizeSessionListView,
  type SessionListView,
} from "@cocurdex/client-runtime";
import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

export interface SessionListUiState {
  view: SessionListView;
  collapsedIds: ReadonlySet<string>;
  expandedSectionKeys: ReadonlySet<string>;
  focusedSectionKey: string | null;
}

const file = new File(Paths.document, "session-list-view.json");
const focusFile = new File(Paths.document, "session-list-focus.json");
const listeners = new Set<() => void>();

function readStoredView() {
  try {
    return normalizeSessionListView(
      file.exists ? JSON.parse(file.textSync()) : null,
    );
  } catch {
    return normalizeSessionListView(null);
  }
}

function readStoredFocus() {
  try {
    const stored: unknown = focusFile.exists
      ? JSON.parse(focusFile.textSync())
      : null;
    return typeof stored === "string" ? stored : null;
  } catch {
    return null;
  }
}

let state: SessionListUiState = {
  view: readStoredView(),
  collapsedIds: new Set(),
  expandedSectionKeys: new Set(),
  focusedSectionKey: readStoredFocus(),
};

function publish(next: SessionListUiState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function toggled(set: ReadonlySet<string>, key: string) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function updateSessionListView(update: Partial<SessionListView>) {
  const previous = state.view.grouping;
  const view = normalizeSessionListView({ ...state.view, ...update });
  publish({ ...state, view, expandedSectionKeys: new Set() });
  void file.write(JSON.stringify(view)).catch(() => undefined);
  if (view.grouping !== previous) focusSessionSection(null);
}

export function focusSessionSection(sectionKey: string | null) {
  if (state.focusedSectionKey === sectionKey) return;
  publish({ ...state, focusedSectionKey: sectionKey });
  void focusFile.write(JSON.stringify(sectionKey)).catch(() => undefined);
}

export function toggleSessionChildren(sessionId: string) {
  publish({ ...state, collapsedIds: toggled(state.collapsedIds, sessionId) });
}

export function toggleSectionExpanded(sectionKey: string) {
  publish({
    ...state,
    expandedSectionKeys: toggled(state.expandedSectionKeys, sectionKey),
  });
}

export function useSessionListUi() {
  return useSyncExternalStore(subscribe, () => state);
}
