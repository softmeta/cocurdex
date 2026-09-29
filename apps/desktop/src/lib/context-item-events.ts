import type { ContextItemAttachment } from "@cocurdex/shared";

const OPEN_CONTEXT_ITEM_EVENT = "cocurdex:open-context-item";

export type ContextItemTarget = Pick<ContextItemAttachment, "id" | "itemKind">;

export function openContextItem(target: ContextItemTarget) {
  window.dispatchEvent(
    new CustomEvent(OPEN_CONTEXT_ITEM_EVENT, { detail: target }),
  );
}

export function onOpenContextItem(
  listener: (target: ContextItemTarget) => void,
) {
  const handleEvent = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      typeof event.detail?.id === "string" &&
      (event.detail.itemKind === "note" || event.detail.itemKind === "issue")
    ) {
      listener(event.detail);
    }
  };
  window.addEventListener(OPEN_CONTEXT_ITEM_EVENT, handleEvent);
  return () => window.removeEventListener(OPEN_CONTEXT_ITEM_EVENT, handleEvent);
}
