import type { KeyValueStorage } from "@cocurdex/client-runtime";
import { EMPTY_DRAFT, type NewSessionDraft } from "./new-session-draft";

interface NewSessionState {
  hostId: string | null;
  draft: NewSessionDraft;
}

export function createNewSessionStore(storage: KeyValueStorage) {
  let state: NewSessionState = { hostId: null, draft: EMPTY_DRAFT };
  const listeners = new Set<() => void>();

  const publish = (next: NewSessionState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const read = (hostId: string): NewSessionDraft => {
    try {
      const text = storage.getItem(`new-session-${hostId}`);
      if (!text) return EMPTY_DRAFT;
      const draft = JSON.parse(text) as NewSessionDraft | null;
      if (
        draft &&
        typeof draft === "object" &&
        (draft.workspaceId === null || typeof draft.workspaceId === "string")
      ) {
        return draft;
      }
    } catch {}
    return EMPTY_DRAFT;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    begin(hostId: string) {
      publish({ hostId, draft: read(hostId) });
    },
    update(change: (draft: NewSessionDraft) => NewSessionDraft) {
      const draft = change(state.draft);
      if (state.hostId) {
        try {
          storage.setItem(`new-session-${state.hostId}`, JSON.stringify(draft));
        } catch {}
      }
      publish({ ...state, draft });
    },
  };
}
