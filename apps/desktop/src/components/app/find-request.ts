import type { RefObject } from "react";
import { useDocumentEvent } from "@/lib/react-hooks";

const FIND_REQUEST_EVENT = "cocurdex:find-request";

declare global {
  interface DocumentEventMap {
    [FIND_REQUEST_EVENT]: Event;
  }
}

export function requestFind(origin?: Element | null) {
  const target = origin ?? document.activeElement ?? document.body;
  target.dispatchEvent(new Event(FIND_REQUEST_EVENT, { bubbles: true }));
}

function isFindShortcut(event: KeyboardEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "f"
  );
}

function isWithinScope(target: EventTarget | null, scope: HTMLElement) {
  if (!scope.isConnected || scope.offsetParent === null) return false;
  if (target === document || target === document.body) return true;
  return target instanceof Node && scope.contains(target);
}

export function useFindTrigger(
  scopeRef: RefObject<HTMLElement | null>,
  onTrigger: () => void,
) {
  useDocumentEvent("keydown", (event) => {
    const scope = scopeRef.current;
    if (!isFindShortcut(event) || !scope) return;
    if (!isWithinScope(event.target, scope)) return;
    event.preventDefault();
    onTrigger();
  });
  useDocumentEvent(FIND_REQUEST_EVENT, (event) => {
    const scope = scopeRef.current;
    if (scope && isWithinScope(event.target, scope)) onTrigger();
  });
}

export function useFindRequest(onRequest: () => void) {
  useDocumentEvent(FIND_REQUEST_EVENT, onRequest);
}
