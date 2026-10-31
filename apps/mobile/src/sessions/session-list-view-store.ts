import {
  normalizeSessionListView,
  type SessionListView,
} from "@cocurdex/shared";
import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

export interface SessionListUiState {
  view: SessionListView;
  collapsedIds: ReadonlySet<string>;
  expandedSectionKeys: ReadonlySet<string>;
}

const file = new File(Paths.document, "session-list-view.json");
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

let state: SessionListUiState = {
  view: readStoredView(),
  collapsedIds: new Set(),
  expandedSectionKeys: new Set(),
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
  const view = normalizeSessionListView({ ...state.view, ...update });
  publish({ ...state, view, expandedSectionKeys: new Set() });
  void file.write(JSON.stringify(view)).catch(() => undefined);
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
