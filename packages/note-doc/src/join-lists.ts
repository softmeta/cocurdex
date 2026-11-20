import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { canJoin, Mapping } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

interface Range {
  from: number;
  to: number;
}

interface ListBoundary extends Range {
  pos: number;
}

function collectBoundaries(
  parent: PmNode,
  contentStart: number,
  boundaries: ListBoundary[],
): void {
  let previous: { node: PmNode; pos: number } | null = null;
  parent.forEach((child, offset) => {
    const childPos = contentStart + offset;
    if (previous?.node.type === child.type && LIST_TYPES.has(child.type.name)) {
      boundaries.push({
        pos: childPos,
        from: previous.pos,
        to: childPos + child.nodeSize,
      });
    }
    if (!child.isTextblock && !child.isLeaf) {
      collectBoundaries(child, childPos + 1, boundaries);
    }
    previous = { node: child, pos: childPos };
  });
}

function changedRanges(transactions: readonly Transaction[]): Range[] {
  const mapping = new Mapping(transactions.flatMap((tr) => tr.mapping.maps));
  const ranges: Range[] = [];
  mapping.maps.forEach((map, index) => {
    const rest = mapping.slice(index + 1);
    map.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
      ranges.push({ from: rest.map(newFrom, -1), to: rest.map(newTo, 1) });
    });
  });
  return ranges;
}

function joinTouchedLists(tr: Transaction, touched: Range[]): Transaction {
  const boundaries: ListBoundary[] = [];
  collectBoundaries(tr.doc, 0, boundaries);
  const toJoin = boundaries.filter((boundary) =>
    touched.some(
      (range) => range.from <= boundary.to && range.to >= boundary.from,
    ),
  );
  for (const { pos } of toJoin.reverse()) {
    if (canJoin(tr.doc, pos)) tr.join(pos);
  }
  return tr;
}

function isRemoteChange(tr: Transaction): boolean {
  const root: Transaction = tr.getMeta("appendedTransaction") ?? tr;
  return root.getMeta(ySyncPluginKey) !== undefined;
}

// Markdown has no way to keep two same-kind lists apart, so adjacent lists an
// edit leaves or touches are merged. Only lists the local edit touched are
// merged, and remote Yjs changes are skipped, so two clients do not both merge
// the same lists and leave duplicated items after sync.
export const JoinAdjacentLists = Extension.create({
  name: "joinAdjacentLists",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("joinAdjacentLists"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (
            !transactions.some((tr) => tr.docChanged) ||
            transactions.some(isRemoteChange)
          ) {
            return null;
          }
          const tr = joinTouchedLists(newState.tr, changedRanges(transactions));
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
