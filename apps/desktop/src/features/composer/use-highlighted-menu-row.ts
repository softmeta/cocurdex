import { useLayoutEffect, useState } from "react";

export function useHighlightedMenuRow({
  highlightedIndex,
  isOpen,
  itemAttribute,
}: {
  highlightedIndex: number;
  isOpen: boolean;
  itemAttribute: string;
}) {
  const [listNode, setListNode] = useState<HTMLElement | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!isOpen || !listNode) {
      setHighlightedItem(null);
      return;
    }

    const sync = () => {
      const item = listNode.querySelector<HTMLElement>(
        `[${itemAttribute}="${highlightedIndex}"]`,
      );
      if (!item) {
        setHighlightedItem(null);
        return;
      }
      const itemRect = item.getBoundingClientRect();
      const listRect = listNode.getBoundingClientRect();
      if (
        listRect.height > 0 &&
        (itemRect.bottom <= listRect.top || itemRect.top >= listRect.bottom)
      ) {
        setHighlightedItem(null);
        return;
      }
      setHighlightedItem(item);
    };

    const item = listNode.querySelector<HTMLElement>(
      `[${itemAttribute}="${highlightedIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
    sync();

    listNode.addEventListener("scroll", sync, { passive: true });
    return () => listNode.removeEventListener("scroll", sync);
  }, [highlightedIndex, isOpen, itemAttribute, listNode]);

  return { highlightedItem, setListNode };
}
