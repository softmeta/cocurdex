import { Extension } from "@tiptap/core";
import {
  Fragment,
  type Node as ProseMirrorNode,
  type ResolvedPos,
  Slice,
} from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { exitTable } from "./table-commands";
import { parseTabularText, tabularRowsToHtml } from "./table-grid";

function isInsideTable($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === "table") return true;
  }
  return false;
}

function withoutColumnWidths(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    const role = node.type.spec.tableRole;
    const isCell = role === "cell" || role === "header_cell";
    const attrs =
      isCell && node.attrs.colwidth ? { ...node.attrs, colwidth: null } : null;
    const content = node.isLeaf
      ? node.content
      : withoutColumnWidths(node.content);
    nodes.push(
      attrs || content !== node.content
        ? node.type.create(attrs ?? node.attrs, content, node.marks)
        : node,
    );
  });
  return Fragment.from(nodes);
}

export const TableEditing = Extension.create({
  name: "tableEditing",
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": ({ editor }) =>
        exitTable(editor.state, editor.view.dispatch),
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tablePaste"),
        props: {
          transformPasted: (slice) =>
            new Slice(
              withoutColumnWidths(slice.content),
              slice.openStart,
              slice.openEnd,
            ),
          handlePaste: (view, event) => {
            const data = event.clipboardData;
            if (!data || data.types.includes("text/html")) return false;
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code) return false;
            const rows = parseTabularText(data.getData("text/plain"));
            const inTable = isInsideTable($from);
            if (!rows || (!inTable && rows.length < 2)) return false;
            view.pasteHTML(tabularRowsToHtml(rows, !inTable));
            return true;
          },
        },
      }),
    ];
  },
});
