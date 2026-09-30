import { useEffectEvent } from "react";
import {
  type ContextItemTarget,
  onOpenContextItem,
} from "@/lib/context-item-events";
import { useMountEffect } from "@/lib/react-hooks";
import { useSearchPaletteActions } from "./use-search-palette-actions";

export function useOpenContextItemBridge() {
  const actions = useSearchPaletteActions(() => {});
  const open = useEffectEvent((target: ContextItemTarget) => {
    if (target.itemKind === "issue") actions.openIssue(target.id);
    else actions.openNote(target.id);
  });
  useMountEffect(() => onOpenContextItem(open));
}
