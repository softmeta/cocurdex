import { useStore } from "jotai";
import { useEffectEvent } from "react";
import { sessionsAtom } from "@/features/sessions";
import {
  type ContextItemTarget,
  onOpenContextItem,
  onOpenSession,
} from "@/lib/context-item-events";
import { useMountEffect } from "@/lib/react-hooks";
import { useSearchPaletteActions } from "./use-search-palette-actions";

export function useOpenContextItemBridge() {
  const store = useStore();
  const actions = useSearchPaletteActions(() => {});
  const open = useEffectEvent((target: ContextItemTarget) => {
    if (target.itemKind === "issue") actions.openIssue(target.id);
    else actions.openNote(target.id);
  });
  const openSession = useEffectEvent((sessionId: string) => {
    const session = store
      .get(sessionsAtom)
      .find((candidate) => candidate.id === sessionId);
    if (session) actions.openSession(session);
  });
  useMountEffect(() => onOpenContextItem(open));
  useMountEffect(() => onOpenSession(openSession));
}
