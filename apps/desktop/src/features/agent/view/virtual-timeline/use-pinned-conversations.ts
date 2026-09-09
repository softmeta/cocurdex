import { type RefObject, useCallback, useLayoutEffect, useState } from "react";

function getConversationId(root: HTMLElement, node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  const row = element?.closest<HTMLElement>("[data-conversation-id]");
  return row && root.contains(row)
    ? (row.dataset.conversationId ?? null)
    : null;
}

export function usePinnedConversations(
  rootRef: RefObject<HTMLDivElement | null>,
) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<[string, string] | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const document = root.ownerDocument;
    const updateSelection = () => {
      const selection = document.getSelection();
      const start = getConversationId(root, selection?.anchorNode ?? null);
      const end = getConversationId(root, selection?.focusNode ?? null);
      setSelectedIds((current) => {
        if (!selection || selection.isCollapsed || !start || !end) return null;
        if (current?.[0] === start && current[1] === end) return current;
        return [start, end];
      });
    };
    document.addEventListener("selectionchange", updateSelection);
    return () =>
      document.removeEventListener("selectionchange", updateSelection);
  }, [rootRef]);

  const updateFocus = useCallback(
    (target: EventTarget | null) => {
      const root = rootRef.current;
      setFocusedId(
        root && target instanceof Node ? getConversationId(root, target) : null,
      );
    },
    [rootRef],
  );

  return { focusedId, selectedIds, updateFocus };
}
