import type {
  AgentEvent,
  TurnChangeSet,
  UndoTurnChangesResult,
} from "@cocurdex/shared";
import { atom, useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { useMemo } from "react";

export function turnChangeSetLookupKey(changeSet: TurnChangeSet) {
  return changeSet.messageId || changeSet.userMessageId;
}

export const turnChangeSetsByMessageAtom = atom<Record<string, TurnChangeSet>>(
  {},
);
/** Undo outcomes survive card remounts (collapse, scroll, session switch). */
export const undoResultsByChangeSetAtom = atom<
  Record<string, UndoTurnChangesResult>
>({});

export const loadTurnChangeSetsAtom = atom(
  null,
  (
    get,
    set,
    input: { sessionId: string; changeSets: Record<string, TurnChangeSet> },
  ) => {
    // Replace this session's entries instead of merging: the map is global and
    // would otherwise keep growing with every session ever opened.
    const next = Object.fromEntries(
      Object.entries(get(turnChangeSetsByMessageAtom)).filter(
        ([, changeSet]) => changeSet.sessionId !== input.sessionId,
      ),
    );
    set(turnChangeSetsByMessageAtom, { ...next, ...input.changeSets });
  },
);

export const applyTurnChangesEventAtom = atom(
  null,
  (get, set, event: AgentEvent) => {
    if (event.type !== "workspace.changes.updated") {
      return;
    }
    const changeSet = event.changeSet;
    const key = turnChangeSetLookupKey(changeSet);
    // In-progress sets are not rendered, so there is nothing to store yet.
    if (changeSet.status === "collecting" || !key) {
      return;
    }
    const next = { ...get(turnChangeSetsByMessageAtom), [key]: changeSet };
    if (changeSet.messageId && changeSet.userMessageId) {
      delete next[changeSet.userMessageId];
    }
    // A discarded turn (nothing changed) arrives with no files: drop the row
    // instead of keeping a placeholder every message would have to render.
    if (changeSet.files.length === 0) {
      delete next[key];
    }
    set(turnChangeSetsByMessageAtom, next);
  },
);

/**
 * Subscribes to one message's change set only — reading the whole map would
 * re-render every message in the transcript on each update.
 */
export function useTurnChangeSet(messageId: string) {
  const changeSetAtom = useMemo(
    () =>
      selectAtom(
        turnChangeSetsByMessageAtom,
        (changeSets) => changeSets[messageId],
      ),
    [messageId],
  );
  return useAtomValue(changeSetAtom);
}
