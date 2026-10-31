import type { EntityRef } from "@cocurdex/shared";
import { useStore } from "jotai";
import { useEffectEvent } from "react";
import { sessionsAtom } from "@/features/sessions";
import { onOpenEntity } from "@/lib/entity-events";
import { useMountEffect } from "@/lib/react-hooks";
import { useSearchPaletteActions } from "./use-search-palette-actions";

export function useOpenEntityBridge() {
  const store = useStore();
  const actions = useSearchPaletteActions(() => {});
  const open = useEffectEvent((ref: EntityRef) => {
    if (ref.kind === "issue") actions.openIssue(ref.id);
    else if (ref.kind === "note") actions.openNote(ref.id);
    else if (ref.kind === "deck") actions.openDeck(ref.id);
    else {
      const session = store
        .get(sessionsAtom)
        .find((candidate) => candidate.id === ref.id);
      if (session) actions.openSession(session);
    }
  });
  useMountEffect(() => onOpenEntity(open));
}
