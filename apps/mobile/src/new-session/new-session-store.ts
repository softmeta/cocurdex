import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { createNewSessionStore } from "./new-session-state";

const preferenceFile = (key: string) =>
  new File(Paths.document, `${encodeURIComponent(key)}.json`);
const store = createNewSessionStore({
  getItem(key) {
    const file = preferenceFile(key);
    return file.exists ? file.textSync() : null;
  },
  setItem(key, value) {
    preferenceFile(key).writeSync(value);
  },
});

export const beginNewSession = store.begin;
export const updateNewSessionDraft = store.update;

export function useNewSessionState() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
