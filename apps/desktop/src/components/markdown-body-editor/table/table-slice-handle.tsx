import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { GripHorizontal, GripVertical } from "lucide-react";
import { type PointerEvent, type RefObject, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import {
  moveTableSlice,
  selectTableSlice,
  type TableAxis,
  type TableTarget,
} from "./table-commands";
import { dropTargetIndex } from "./table-grid";
import type { TableHoverStore, TableLayout } from "./table-hover-store";
import { TableSliceMenuItems } from "./table-slice-menu";
import { boundaryAt, resolveTableTarget } from "./table-target";

const DRAG_THRESHOLD = 4;

interface DragState {
  origin: number;
  moved: boolean;
  boundary: number | null;
}

interface OpenMenu {
  target: TableTarget;
  state: EditorState;
}

export interface TableDropIndicator {
  axis: TableAxis;
  boundary: number;
}

interface TableSliceHandleProps {
  editor: Editor;
  store: TableHoverStore;
  layout: TableLayout;
  axis: TableAxis;
  layerRef: RefObject<HTMLDivElement | null>;
  onDropIndicator: (indicator: TableDropIndicator | null) => void;
}

function handleBox(layout: TableLayout, axis: TableAxis) {
  if (axis === "row") {
    const span = layout.rows[layout.row];
    return {
      left: layout.frame.left - 8,
      top: span.start + span.size / 2 - 11,
    };
  }
  const span = layout.columns[layout.column];
  return {
    left: span.start + span.size / 2 - 11,
    top: layout.frame.top - 8,
  };
}

function isColumnVisible(layout: TableLayout): boolean {
  const span = layout.columns[layout.column];
  const center = span.start + span.size / 2;
  return center >= layout.clip.left && center <= layout.clip.right;
}

export function TableSliceHandle({
  editor,
  store,
  layout,
  axis,
  layerRef,
  onDropIndicator,
}: TableSliceHandleProps) {
  const { t } = useTranslation("notes");
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const index = axis === "row" ? layout.row : layout.column;
  const isRow = axis === "row";

  const pointerCoordinate = (event: PointerEvent) => {
    const origin = layerRef.current?.getBoundingClientRect();
    if (!origin) return 0;
    return isRow ? event.clientY - origin.top : event.clientX - origin.left;
  };

  const logicalBoundary = (coordinate: number) => {
    const spans = isRow ? layout.rows : layout.columns;
    const physical = boundaryAt(spans, coordinate);
    return !isRow && layout.rtl ? spans.length - physical : physical;
  };

  const openMenu = () => {
    const target = resolveTableTarget(editor, layout.table, axis, index);
    if (!target) return;
    store.setPinned(true);
    selectTableSlice(target)(editor.state, editor.view.dispatch);
    setMenu({ target, state: editor.state });
  };

  const closeMenu = () => {
    setMenu(null);
    store.setPinned(false);
    editor.view.focus();
  };

  const finishDrag = () => {
    setDrag(null);
    onDropIndicator(null);
    store.setPinned(false);
  };

  if (!isRow && !isColumnVisible(layout)) return null;
  const box = handleBox(layout, axis);
  const label = isRow
    ? t("table.rowOptions", { index: index + 1 })
    : t("table.columnOptions", { index: index + 1 });
  const Icon = isRow ? GripVertical : GripHorizontal;

  return (
    <DropdownMenu
      open={menu !== null}
      onOpenChange={(open) => {
        if (open) openMenu();
        else closeMenu();
      }}
    >
      <DropdownMenuTrigger
        aria-label={label}
        data-table-axis={axis}
        className={cn(
          "pointer-events-auto absolute flex cursor-grab touch-none items-center justify-center rounded-dense bg-background text-muted-foreground/70 hover:bg-accent hover:text-foreground active:cursor-grabbing data-popup-open:bg-primary data-popup-open:text-primary-foreground",
          isRow && "h-[22px] w-4",
          !isRow && "h-4 w-[22px]",
        )}
        style={{ left: box.left, top: box.top }}
        onMouseDown={(event) => {
          if (event.button === 0) event.preventBaseUIHandler?.();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          store.setPinned(true);
          setDrag({
            origin: pointerCoordinate(event),
            moved: false,
            boundary: null,
          });
        }}
        onPointerMove={(event) => {
          if (!drag) return;
          const coordinate = pointerCoordinate(event);
          const moved =
            drag.moved || Math.abs(coordinate - drag.origin) > DRAG_THRESHOLD;
          if (!moved) return;
          if (!drag.moved) {
            const target = resolveTableTarget(
              editor,
              layout.table,
              axis,
              index,
            );
            if (target)
              selectTableSlice(target)(editor.state, editor.view.dispatch);
          }
          const boundary = logicalBoundary(coordinate);
          setDrag({ ...drag, moved, boundary });
          onDropIndicator({ axis, boundary });
        }}
        onPointerUp={() => {
          if (!drag) return;
          const moved = drag.moved;
          const boundary = drag.boundary;
          finishDrag();
          if (!moved) {
            openMenu();
            return;
          }
          const target = resolveTableTarget(editor, layout.table, axis, index);
          const to =
            target && boundary !== null
              ? dropTargetIndex(target.range, boundary)
              : null;
          if (target && to !== null) {
            moveTableSlice(target, to)(editor.state, editor.view.dispatch);
          }
          editor.view.focus();
        }}
        onPointerCancel={finishDrag}
      >
        <Icon className="size-3.5" />
      </DropdownMenuTrigger>
      {menu ? (
        <DropdownMenuContent
          side={isRow ? "left" : "bottom"}
          align="start"
          finalFocus={false}
        >
          <TableSliceMenuItems
            editor={editor}
            state={menu.state}
            target={menu.target}
            rtl={layout.rtl}
          />
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}
