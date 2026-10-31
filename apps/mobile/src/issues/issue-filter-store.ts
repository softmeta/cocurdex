import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import {
  EMPTY_ISSUE_FILTERS,
  type IssueFilters,
  normalizeIssueFilters,
} from "./issue-filters";

const file = new File(Paths.document, "issue-filters.json");
const listeners = new Set<() => void>();

function readStored(): Record<string, IssueFilters> {
  try {
    const raw: unknown = file.exists ? JSON.parse(file.textSync()) : null;
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(
      Object.entries(raw).map(([hostId, filters]) => [
        hostId,
        normalizeIssueFilters(filters),
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

export function setIssueFilters(hostId: string, filters: IssueFilters) {
  byHost = { ...byHost, [hostId]: filters };
  for (const listener of listeners) listener();
  void file.write(JSON.stringify(byHost)).catch(() => undefined);
}

export function useIssueFilters(hostId: string): IssueFilters {
  return useSyncExternalStore(
    subscribe,
    () => byHost[hostId] ?? EMPTY_ISSUE_FILTERS,
  );
}
