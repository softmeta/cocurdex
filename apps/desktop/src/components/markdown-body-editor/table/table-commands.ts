import {
  Fragment,
  type Node as ProseMirrorNode,
  type ResolvedPos,
} from "@tiptap/pm/model";
import {
  type Command,
  type EditorState,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import {
  type IndexRange,
  moveBlock,
  type SortDirection,
  sortedOrder,
} from "./table-grid";

export type TableAxis = "row" | "column";
export type ColumnAlign = "left" | "center" | "right";

export interface TableTarget {
  tablePos: number;
  axis: TableAxis;
  range: IndexRange;
}

interface CellFocus {
  row: number;
  column: number;
}

function tableAt(state: EditorState, tablePos: number) {
  const node = state.doc.nodeAt(tablePos);
  return node?.type.spec.tableRole === "table" ? node : null;
}

function rowsOf(table: ProseMirrorNode): ProseMirrorNode[] {
  const rows: ProseMirrorNode[] = [];
  table.forEach((row) => {
    rows.push(row);
  });
  return rows;
}

function cellsOf(row: ProseMirrorNode): ProseMirrorNode[] {
  const cells: ProseMirrorNode[] = [];
  row.forEach((cell) => {
    cells.push(cell);
  });
  return cells;
}

export function isPlainGrid(table: ProseMirrorNode): boolean {
  const map = TableMap.get(table);
  return map.map.length === new Set(map.map).size;
}

function isHeaderCell(cell: ProseMirrorNode): boolean {
  return cell.type.spec.tableRole === "header_cell";
}

export function hasHeaderRow(table: ProseMirrorNode): boolean {
  const first = table.firstChild;
  return Boolean(first && cellsOf(first).every(isHeaderCell));
}

function retypeRow(
  row: ProseMirrorNode,
  role: "header_cell" | "cell",
): ProseMirrorNode {
  const schema = row.type.schema;
  const type =
    role === "header_cell" ? schema.nodes.tableHeader : schema.nodes.tableCell;
  return row.copy(
    Fragment.from(
      cellsOf(row).map((cell) =>
        cell.type === type ? cell : type.create(cell.attrs, cell.content),
      ),
    ),
  );
}

function keepHeaderOnTop(
  rows: ProseMirrorNode[],
  previousHeader: ProseMirrorNode | null,
): ProseMirrorNode[] {
  if (!previousHeader) return rows;
  return rows.map((row, index) => {
    if (index === 0) return retypeRow(row, "header_cell");
    return row === previousHeader ? retypeRow(row, "cell") : row;
  });
}

function emptyCell(
  template: ProseMirrorNode,
  type = template.type,
): ProseMirrorNode {
  const filled = type.createAndFill();
  if (!filled) throw new Error("table cell type cannot be filled");
  return filled;
}

function emptyRowLike(row: ProseMirrorNode): ProseMirrorNode {
  const schema = row.type.schema;
  return row.copy(
    Fragment.from(
      cellsOf(row).map((cell) => emptyCell(cell, schema.nodes.tableCell)),
    ),
  );
}

function cellTextStart(
  doc: ProseMirrorNode,
  tablePos: number,
  focus: CellFocus,
): Selection {
  const table = doc.nodeAt(tablePos);
  if (!table) return Selection.near(doc.resolve(tablePos));
  const map = TableMap.get(table);
  const row = Math.min(focus.row, map.height - 1);
  const column = Math.min(focus.column, map.width - 1);
  const cellPos = tablePos + 1 + map.positionAt(row, column, table);
  return TextSelection.near(doc.resolve(cellPos + 1));
}

function replaceTable(
  state: EditorState,
  tablePos: number,
  table: ProseMirrorNode,
  rows: ProseMirrorNode[],
  focus: CellFocus,
): Transaction {
  const tr = state.tr.replaceWith(
    tablePos,
    tablePos + table.nodeSize,
    table.copy(Fragment.from(rows)),
  );
  return tr.setSelection(cellTextStart(tr.doc, tablePos, focus));
}

function deleteWholeTable(
  state: EditorState,
  tablePos: number,
  table: ProseMirrorNode,
): Transaction {
  const tr = state.tr.delete(tablePos, tablePos + table.nodeSize);
  const $pos = tr.doc.resolve(Math.min(tablePos, tr.doc.content.size));
  return tr.setSelection(Selection.near($pos));
}

function plainTableCommand(
  tablePos: number,
  build: (
    state: EditorState,
    table: ProseMirrorNode,
    rows: ProseMirrorNode[],
  ) => Transaction | null,
): Command {
  return (state, dispatch) => {
    const table = tableAt(state, tablePos);
    if (!table || !isPlainGrid(table)) return false;
    const tr = build(state, table, rowsOf(table));
    if (!tr) return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

function mapColumns(
  rows: ProseMirrorNode[],
  update: (cells: ProseMirrorNode[], row: ProseMirrorNode) => ProseMirrorNode[],
): ProseMirrorNode[] {
  return rows.map((row) => row.copy(Fragment.from(update(cellsOf(row), row))));
}

function axisLength(table: ProseMirrorNode, axis: TableAxis): number {
  const map = TableMap.get(table);
  return axis === "row" ? map.height : map.width;
}

function validRange(
  table: ProseMirrorNode,
  axis: TableAxis,
  range: IndexRange,
): boolean {
  return (
    range.from >= 0 &&
    range.from <= range.to &&
    range.to < axisLength(table, axis)
  );
}

export function moveTableSlice(target: TableTarget, to: number): Command {
  const { tablePos, axis, range } = target;
  return plainTableCommand(tablePos, (state, table, rows) => {
    if (!validRange(table, axis, range) || to === range.from) return null;
    if (axis === "row") {
      const header = hasHeaderRow(table) ? rows[0] : null;
      const moved = keepHeaderOnTop(moveBlock(rows, range, to), header);
      return replaceTable(state, tablePos, table, moved, {
        row: to,
        column: 0,
      });
    }
    const moved = mapColumns(rows, (cells) => moveBlock(cells, range, to));
    return replaceTable(state, tablePos, table, moved, { row: 0, column: to });
  });
}

export function insertTableSlice(
  tablePos: number,
  axis: TableAxis,
  index: number,
  count = 1,
): Command {
  return plainTableCommand(tablePos, (state, table, rows) => {
    if (index < 0 || index > axisLength(table, axis) || count < 1) return null;
    if (axis === "row") {
      const template = rows[Math.min(index, rows.length - 1)];
      const added = Array.from({ length: count }, () => emptyRowLike(template));
      const header = hasHeaderRow(table) ? rows[0] : null;
      const next = keepHeaderOnTop(
        [...rows.slice(0, index), ...added, ...rows.slice(index)],
        header,
      );
      return replaceTable(state, tablePos, table, next, {
        row: index,
        column: 0,
      });
    }
    const next = mapColumns(rows, (cells) => {
      const template = cells[Math.min(index, cells.length - 1)];
      const added = Array.from({ length: count }, () => emptyCell(template));
      return [...cells.slice(0, index), ...added, ...cells.slice(index)];
    });
    return replaceTable(state, tablePos, table, next, {
      row: 0,
      column: index,
    });
  });
}

export function duplicateTableSlice(target: TableTarget): Command {
  const { tablePos, axis, range } = target;
  return plainTableCommand(tablePos, (state, table, rows) => {
    if (!validRange(table, axis, range)) return null;
    const after = range.to + 1;
    if (axis === "row") {
      const copies = rows
        .slice(range.from, after)
        .map((row) => retypeRow(row, "cell"));
      const header = hasHeaderRow(table) ? rows[0] : null;
      const next = keepHeaderOnTop(
        [...rows.slice(0, after), ...copies, ...rows.slice(after)],
        header,
      );
      return replaceTable(state, tablePos, table, next, {
        row: after,
        column: 0,
      });
    }
    const next = mapColumns(rows, (cells) => [
      ...cells.slice(0, after),
      ...cells.slice(range.from, after),
      ...cells.slice(after),
    ]);
    return replaceTable(state, tablePos, table, next, {
      row: 0,
      column: after,
    });
  });
}

export function deleteTableSlice(target: TableTarget): Command {
  const { tablePos, axis, range } = target;
  return plainTableCommand(tablePos, (state, table, rows) => {
    if (!validRange(table, axis, range)) return null;
    const count = range.to - range.from + 1;
    if (count >= axisLength(table, axis)) {
      return deleteWholeTable(state, tablePos, table);
    }
    const keep = (_: unknown, index: number) =>
      index < range.from || index > range.to;
    const focusIndex = Math.max(0, range.from - 1);
    if (axis === "row") {
      const header = hasHeaderRow(table) ? rows[0] : null;
      const remaining = rows.filter(keep);
      const next =
        header && range.from === 0
          ? remaining.map((row, index) =>
              index === 0 ? retypeRow(row, "header_cell") : row,
            )
          : remaining;
      return replaceTable(state, tablePos, table, next, {
        row: focusIndex,
        column: 0,
      });
    }
    const next = mapColumns(rows, (cells) => cells.filter(keep));
    return replaceTable(state, tablePos, table, next, {
      row: 0,
      column: focusIndex,
    });
  });
}

export function clearTableSlice(target: TableTarget): Command {
  const { tablePos, axis, range } = target;
  return plainTableCommand(tablePos, (state, table, rows) => {
    if (!validRange(table, axis, range)) return null;
    const inRange = (index: number) => index >= range.from && index <= range.to;
    const next = rows.map((row, rowIndex) =>
      row.copy(
        Fragment.from(
          cellsOf(row).map((cell, columnIndex) => {
            const index = axis === "row" ? rowIndex : columnIndex;
            return inRange(index)
              ? cell.type.create(cell.attrs, emptyCell(cell).content)
              : cell;
          }),
        ),
      ),
    );
    return replaceTable(state, tablePos, table, next, {
      row: axis === "row" ? range.from : 0,
      column: axis === "column" ? range.from : 0,
    });
  });
}

export function setTableColumnAlign(
  target: TableTarget,
  align: ColumnAlign | null,
): Command {
  const { tablePos, range } = target;
  return plainTableCommand(tablePos, (state, table, rows) => {
    if (!validRange(table, "column", range)) return null;
    const tr = state.tr;
    const map = TableMap.get(table);
    rows.forEach((_row, rowIndex) => {
      for (let column = range.from; column <= range.to; column += 1) {
        const cellPos = tablePos + 1 + map.positionAt(rowIndex, column, table);
        tr.setNodeAttribute(cellPos, "align", align);
      }
    });
    return tr;
  });
}

export function sortTableByColumn(
  tablePos: number,
  column: number,
  direction: SortDirection,
): Command {
  return plainTableCommand(tablePos, (state, table, rows) => {
    if (column < 0 || column >= axisLength(table, "column")) return null;
    const bodyStart = hasHeaderRow(table) ? 1 : 0;
    const body = rows.slice(bodyStart);
    const keys = body.map((row) => row.child(column).textContent);
    const order = sortedOrder(keys, direction);
    if (order.every((value, index) => value === index)) return null;
    const next = [
      ...rows.slice(0, bodyStart),
      ...order.map((index) => body[index]),
    ];
    return replaceTable(state, tablePos, table, next, { row: 0, column });
  });
}

function isEmptyCell(cell: ProseMirrorNode): boolean {
  return cell.childCount === 1 && cell.child(0).content.size === 0;
}

export function trimTrailingEmptySlices(
  tablePos: number,
  axis: TableAxis,
  count: number,
): Command {
  return plainTableCommand(tablePos, (state, table, rows) => {
    const length = axisLength(table, axis);
    let removable = 0;
    while (removable < count && removable < length - 1) {
      const index = length - 1 - removable;
      const slice =
        axis === "row"
          ? cellsOf(rows[index])
          : rows.map((row) => row.child(index));
      if (!slice.every(isEmptyCell)) break;
      removable += 1;
    }
    if (removable === 0) return null;
    const keepLength = length - removable;
    const next =
      axis === "row"
        ? rows.slice(0, keepLength)
        : mapColumns(rows, (cells) => cells.slice(0, keepLength));
    return replaceTable(state, tablePos, table, next, {
      row: axis === "row" ? keepLength - 1 : 0,
      column: axis === "column" ? keepLength - 1 : 0,
    });
  });
}

export function selectTableSlice(target: TableTarget): Command {
  const { tablePos, axis, range } = target;
  return (state, dispatch) => {
    const table = tableAt(state, tablePos);
    if (!table || !validRange(table, axis, range)) return false;
    const map = TableMap.get(table);
    const resolveCell = (row: number, column: number) =>
      state.doc.resolve(tablePos + 1 + map.positionAt(row, column, table));
    const selection =
      axis === "row"
        ? CellSelection.rowSelection(
            resolveCell(range.from, 0),
            resolveCell(range.to, map.width - 1),
          )
        : CellSelection.colSelection(
            resolveCell(0, range.from),
            resolveCell(map.height - 1, range.to),
          );
    dispatch?.(state.tr.setSelection(selection));
    return true;
  };
}

export function selectedTableRange(
  state: EditorState,
  tablePos: number,
  axis: TableAxis,
): IndexRange | null {
  const { selection } = state;
  if (!(selection instanceof CellSelection)) return null;
  const table = tableAt(state, tablePos);
  if (!table || selection.$anchorCell.before(-1) !== tablePos) return null;
  const isFull =
    axis === "row" ? selection.isRowSelection() : selection.isColSelection();
  if (!isFull) return null;
  const map = TableMap.get(table);
  const rect = map.rectBetween(
    selection.$anchorCell.pos - tablePos - 1,
    selection.$headCell.pos - tablePos - 1,
  );
  return axis === "row"
    ? { from: rect.top, to: rect.bottom - 1 }
    : { from: rect.left, to: rect.right - 1 };
}

function enclosingTableDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === "table") return depth;
  }
  return null;
}

export const exitTable: Command = (state, dispatch) => {
  const { selection } = state;
  const $from =
    selection instanceof CellSelection ? selection.$headCell : selection.$from;
  const depth = enclosingTableDepth($from);
  if (depth === null) return false;
  const after = $from.after(depth);
  const paragraph = state.schema.nodes.paragraph;
  if (!dispatch) return true;
  const next = state.doc.resolve(after).nodeAfter;
  const tr = state.tr;
  if (next?.type === paragraph && next.content.size === 0) {
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  } else {
    tr.insert(after, paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  }
  dispatch(tr.scrollIntoView());
  return true;
};
