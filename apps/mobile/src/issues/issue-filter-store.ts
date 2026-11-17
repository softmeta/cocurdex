import type { IssuePlace } from "@cocurdex/client-runtime";
import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import {
  DEFAULT_ISSUE_LIST_STATE,
  type IssueFilters,
  type IssueListState,
  normalizeIssueListState,
} from "./issue-filters";

const file = new File(Paths.document, "issue-filters.json");
const listeners = new Set<() => void>();

function readStored(): Record<string, IssueListState> {
  try {
    const raw: unknown = file.exists ? JSON.parse(file.textSync()) : null;
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(
      Object.entries(raw).map(([hostId, state]) => [
        hostId,
        normalizeIssueListState(state),
      ]),
    );
  } catch {
    return {};
  }
}

let byHost = readStored();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(hostId: string, update: Partial<IssueListState>) {
  const current = byHost[hostId] ?? DEFAULT_ISSUE_LIST_STATE;
  byHost = { ...byHost, [hostId]: { ...current, ...update } };
  for (const listener of listeners) listener();
  void file.write(JSON.stringify(byHost)).catch(() => undefined);
}

export function setIssueFilters(hostId: string, filters: IssueFilters) {
  publish(hostId, { filters });
}

export function setIssuePlace(hostId: string, place: IssuePlace) {
  publish(hostId, { place });
}

function useIssueListState(hostId: string): IssueListState {
  return useSyncExternalStore(
    subscribe,
    () => byHost[hostId] ?? DEFAULT_ISSUE_LIST_STATE,
  );
}

export function useIssueFilters(hostId: string): IssueFilters {
  return useIssueListState(hostId).filters;
}

export function useIssuePlace(hostId: string): IssuePlace {
  return useIssueListState(hostId).place;
}
