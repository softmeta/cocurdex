import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { canJoin } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

function collectBoundaries(
  parent: PmNode,
  contentStart: number,
  boundaries: number[],
): void {
  let previous: PmNode | null = null;
  parent.forEach((child, offset) => {
    const childPos = contentStart + offset;
    if (previous?.type === child.type && LIST_TYPES.has(child.type.name)) {
      boundaries.push(childPos);
    }
    if (!child.isTextblock && !child.isLeaf) {
      collectBoundaries(child, childPos + 1, boundaries);
    }
    previous = child;
  });
}

function adjacentListBoundaries(doc: PmNode): number[] {
  const boundaries: number[] = [];
  collectBoundaries(doc, 0, boundaries);
  return boundaries;
}

function joinAdjacentLists(tr: Transaction): Transaction {
  const boundaries = adjacentListBoundaries(tr.doc);
  for (const pos of boundaries.reverse()) {
    if (canJoin(tr.doc, pos)) tr.join(pos);
  }
  return tr;
}

function isRemoteChange(tr: Transaction): boolean {
  const root: Transaction = tr.getMeta("appendedTransaction") ?? tr;
  return root.getMeta(ySyncPluginKey) !== undefined;
}

// Markdown has no way to keep two same-kind lists apart, so adjacent lists
// left behind by deleting the block between them are merged. Remote Yjs
// changes are skipped: the client that made the edit merges and syncs it.
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
          const tr = joinAdjacentLists(newState.tr);
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
