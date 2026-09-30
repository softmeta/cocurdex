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

  const highlightedValue = items[highlightedIndex];
  const isActive =
    isOpen && listNode !== null && highlightedValue !== undefined;

  useLayoutEffect(() => {
    if (!isOpen || !listNode || highlightedValue === undefined) {
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
  }, [highlightedIndex, highlightedValue, isOpen, itemAttribute, listNode]);

  return {
    highlightedItem:
      isActive && highlightedItem?.isConnected ? highlightedItem : null,
    setListNode,
  };
}
