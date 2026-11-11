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
export const undoResultsByChangeSetAtom = atom<
  Record<string, UndoTurnChangesResult>
>({});

export const mergeTurnChangeSetsAtom = atom(
  null,
  (
    get,
    set,
    input: {
      changeSets: Record<string, TurnChangeSet>;
      deletedIds?: readonly string[];
    },
  ) => {
    const deleted = new Set(input.deletedIds ?? []);
    const next = Object.fromEntries(
      Object.entries(get(turnChangeSetsByMessageAtom)).filter(
        ([, changeSet]) => !deleted.has(changeSet.id),
      ),
    );
    for (const changeSet of Object.values(input.changeSets)) {
      if (changeSet.messageId && changeSet.userMessageId) {
        delete next[changeSet.userMessageId];
      }
    }
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
    if (changeSet.status === "collecting" || !key) {
      return;
    }
    const next = { ...get(turnChangeSetsByMessageAtom), [key]: changeSet };
    if (changeSet.messageId && changeSet.userMessageId) {
      delete next[changeSet.userMessageId];
    }
    if (changeSet.files.length === 0) {
      delete next[key];
    }
    set(turnChangeSetsByMessageAtom, next);
  },
);

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
