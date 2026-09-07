import { useLayoutEffect, useState } from "react";

export function useHighlightedMenuRow({
  highlightedIndex,
  isOpen,
  itemAttribute,
  items,
}: {
  highlightedIndex: number;
  isOpen: boolean;
  itemAttribute: string;
  items: readonly unknown[];
}) {
  const [listNode, setListNode] = useState<HTMLElement | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!isOpen || !listNode || items[highlightedIndex] === undefined) {
      setHighlightedItem(null);
      return;
    }

    const sync = () => {
      const item = listNode.querySelector<HTMLElement>(
        `[${itemAttribute}="${highlightedIndex}"]`,
      );
      if (!item?.isConnected) {
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
  }, [highlightedIndex, isOpen, itemAttribute, items, listNode]);

  return { highlightedItem, setListNode };
}
