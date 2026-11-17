import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

export const ALL_NOTES_PLACE = "all";
const NO_WORKSPACE_PLACE = "workspace:none";

const file = new File(Paths.document, "note-places.json");
const listeners = new Set<() => void>();

function readStored(): Record<string, string> {
  try {
    const raw: unknown = file.exists ? JSON.parse(file.textSync()) : null;
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
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

export function notePlaceKey(workspaceId: string | null) {
  return workspaceId === null ? NO_WORKSPACE_PLACE : `workspace:${workspaceId}`;
}

export function notePlaceWorkspaceId(place: string) {
  if (place === ALL_NOTES_PLACE || place === NO_WORKSPACE_PLACE) return null;
  return place.slice("workspace:".length);
}

export function setNotePlace(hostId: string, place: string) {
  if ((byHost[hostId] ?? ALL_NOTES_PLACE) === place) return;
  byHost = { ...byHost, [hostId]: place };
  for (const listener of listeners) listener();
  void file.write(JSON.stringify(byHost)).catch(() => undefined);
}

export function useNotePlace(hostId: string): string {
  return useSyncExternalStore(
    subscribe,
    () => byHost[hostId] ?? ALL_NOTES_PLACE,
  );
}
