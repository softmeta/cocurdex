import type { Editor } from "@tiptap/core";
import {
  selectedTableRange,
  type TableAxis,
  type TableTarget,
} from "./table-commands";

export function tablePosFromDom(
  editor: Editor,
  table: HTMLTableElement,
): number | null {
  const cell = table.rows[0]?.cells[0];
  if (!cell) return null;
  const $pos = editor.state.doc.resolve(editor.view.posAtDOM(cell, 0));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === "table") {
      return $pos.before(depth);
    }
  }
  return null;
}

export function resolveTableTarget(
  editor: Editor,
  table: HTMLTableElement,
  axis: TableAxis,
  index: number,
): TableTarget | null {
  const tablePos = tablePosFromDom(editor, table);
  if (tablePos === null) return null;
  const selected = selectedTableRange(editor.state, tablePos, axis);
  const range =
    selected && index >= selected.from && index <= selected.to
      ? selected
      : { from: index, to: index };
  return { tablePos, axis, range };
}

export function boundaryAt(
  spans: readonly { start: number; size: number }[],
  coordinate: number,
): number {
  return spans.filter((span) => span.start + span.size / 2 < coordinate).length;
}
