import { type EntityRef, isLinkableEntityKind } from "@cocurdex/shared";

const OPEN_ENTITY_EVENT = "cocurdex:open-entity";

export function openEntity(ref: EntityRef) {
  window.dispatchEvent(new CustomEvent(OPEN_ENTITY_EVENT, { detail: ref }));
}

export function onOpenEntity(listener: (ref: EntityRef) => void) {
  const handleEvent = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      typeof event.detail?.id === "string" &&
      isLinkableEntityKind(event.detail.kind)
    ) {
      listener({ kind: event.detail.kind, id: event.detail.id });
    }
  };
  window.addEventListener(OPEN_ENTITY_EVENT, handleEvent);
  return () => window.removeEventListener(OPEN_ENTITY_EVENT, handleEvent);
}
