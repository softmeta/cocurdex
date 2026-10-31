import type { Editor } from "@tiptap/core";

export interface Span {
  start: number;
  size: number;
}

export interface TableLayout {
  table: HTMLTableElement;
  row: number;
  column: number;
  rows: Span[];
  columns: Span[];
  frame: { left: number; top: number; right: number; bottom: number };
  clip: { left: number; right: number };
  rtl: boolean;
}

export interface TableHoverStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TableLayout | null;
  setPinned: (pinned: boolean) => void;
  destroy: () => void;
}

const HOVER_MARGIN = 28;

function cellOf(target: EventTarget | null, root: HTMLElement) {
  if (!(target instanceof Element)) return null;
  const cell = target.closest("td, th");
  return cell instanceof HTMLTableCellElement && root.contains(cell)
    ? cell
    : null;
}

function measure(
  container: HTMLElement,
  table: HTMLTableElement,
  row: number,
  column: number,
): TableLayout | null {
  const origin = container.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const firstRow = table.rows[0];
  if (!firstRow || tableRect.width === 0) return null;
  const rows = [...table.rows].map((element) => {
    const rect = element.getBoundingClientRect();
    return { start: rect.top - origin.top, size: rect.height };
  });
  const columns = [...firstRow.cells].map((element) => {
    const rect = element.getBoundingClientRect();
    return { start: rect.left - origin.left, size: rect.width };
  });
  const viewport = (table.parentElement ?? table).getBoundingClientRect();
  return {
    table,
    row: Math.min(row, rows.length - 1),
    column: Math.min(column, columns.length - 1),
    rows,
    columns,
    frame: {
      left: tableRect.left - origin.left,
      top: tableRect.top - origin.top,
      right: tableRect.right - origin.left,
      bottom: tableRect.bottom - origin.top,
    },
    clip: {
      left: Math.max(viewport.left, tableRect.left) - origin.left,
      right: Math.min(viewport.right, tableRect.right) - origin.left,
    },
    rtl: getComputedStyle(table).direction === "rtl",
  };
}

function isNear(
  layout: TableLayout,
  container: HTMLElement,
  x: number,
  y: number,
) {
  const origin = container.getBoundingClientRect();
  const left = x - origin.left;
  const top = y - origin.top;
  return (
    left >= layout.clip.left - HOVER_MARGIN &&
    left <= layout.clip.right + HOVER_MARGIN &&
    top >= layout.frame.top - HOVER_MARGIN &&
    top <= layout.frame.bottom + HOVER_MARGIN
  );
}

export function createTableHoverStore(
  editor: Editor,
  container: HTMLElement,
  layer: HTMLElement,
): TableHoverStore {
  const listeners = new Set<() => void>();
  let snapshot: TableLayout | null = null;
  let pinned = false;
  let frame = 0;

  const publish = (next: TableLayout | null) => {
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const show = (cell: HTMLTableCellElement) => {
    const row = cell.parentElement;
    const table = cell.closest("table");
    if (!(row instanceof HTMLTableRowElement) || !table) return;
    publish(measure(container, table, row.rowIndex, cell.cellIndex));
  };

  const remeasure = () => {
    frame = 0;
    if (!snapshot) return;
    if (!snapshot.table.isConnected) {
      publish(null);
      return;
    }
    publish(measure(container, snapshot.table, snapshot.row, snapshot.column));
  };

  const scheduleRemeasure = () => {
    if (!frame) frame = requestAnimationFrame(remeasure);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.target instanceof Node && layer.contains(event.target)) {
      editor.view.dom.dispatchEvent(
        new MouseEvent("mousemove", {
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: true,
        }),
      );
      return;
    }
    if (pinned || event.buttons !== 0) return;
    const cell = cellOf(event.target, editor.view.dom);
    if (cell) {
      const row = cell.parentElement as HTMLTableRowElement;
      if (
        snapshot?.table === cell.closest("table") &&
        snapshot.row === row.rowIndex &&
        snapshot.column === cell.cellIndex
      ) {
        return;
      }
      show(cell);
      return;
    }
    if (
      snapshot &&
      !isNear(snapshot, container, event.clientX, event.clientY)
    ) {
      publish(null);
    }
  };

  const onKeyDown = () => {
    if (!pinned) publish(null);
  };

  const resizeObserver = new ResizeObserver(scheduleRemeasure);
  resizeObserver.observe(container);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  container.addEventListener("scroll", scheduleRemeasure, {
    capture: true,
    passive: true,
  });
  editor.on("update", scheduleRemeasure);
  editor.view.dom.addEventListener("keydown", onKeyDown);

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    setPinned: (next) => {
      pinned = next;
      if (!next) scheduleRemeasure();
    },
    destroy: () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("scroll", scheduleRemeasure, {
        capture: true,
      });
      editor.off("update", scheduleRemeasure);
      editor.view.dom.removeEventListener("keydown", onKeyDown);
      listeners.clear();
    },
  };
}
