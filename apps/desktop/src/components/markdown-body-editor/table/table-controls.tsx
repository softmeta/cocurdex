import type { Editor } from "@tiptap/core";
import { Plus } from "lucide-react";
import {
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib";
import {
  insertTableSlice,
  type TableAxis,
  trimTrailingEmptySlices,
} from "./table-commands";
import {
  createTableHoverStore,
  type TableHoverStore,
  type TableLayout,
} from "./table-hover-store";
import {
  type TableDropIndicator,
  TableSliceHandle,
} from "./table-slice-handle";
import { tablePosFromDom } from "./table-target";

const ADD_BAR_GAP = 4;
const HANDLE_OVERHANG = 8;
const ADD_BAR_SIZE = 14;
const INDICATOR_SIZE = 2;

const noStore = () => () => {};
const noLayout = () => null;

interface GrowState {
  origin: number;
  added: number;
  unit: number;
  baseLength: number;
}

function addBarBox(layout: TableLayout, axis: TableAxis) {
  const { frame, clip } = layout;
  if (axis === "row") {
    return {
      left: clip.left,
      top: frame.bottom + ADD_BAR_GAP,
      width: clip.right - clip.left,
      height: ADD_BAR_SIZE,
    };
  }
  const left = layout.rtl
    ? clip.left - ADD_BAR_GAP - ADD_BAR_SIZE
    : clip.right + ADD_BAR_GAP;
  return {
    left,
    top: frame.top,
    width: ADD_BAR_SIZE,
    height: frame.bottom - frame.top,
  };
}

function averageSize(layout: TableLayout, axis: TableAxis): number {
  const spans = axis === "row" ? layout.rows : layout.columns;
  const total = spans.reduce((sum, span) => sum + span.size, 0);
  return Math.max(16, total / spans.length);
}

function TableAddBar({
  editor,
  store,
  layout,
  axis,
}: {
  editor: Editor;
  store: TableHoverStore;
  layout: TableLayout;
  axis: TableAxis;
}) {
  const { t } = useTranslation("notes");
  const [grow, setGrow] = useState<GrowState | null>(null);
  const isRow = axis === "row";
  const box = addBarBox(layout, axis);
  const label = isRow ? t("table.addRow") : t("table.addColumn");

  const coordinate = (event: PointerEvent) => {
    const value = isRow ? event.clientY : event.clientX;
    return !isRow && layout.rtl ? -value : value;
  };

  const currentLength = isRow ? layout.rows.length : layout.columns.length;

  const resize = (baseLength: number, added: number, wanted: number) => {
    const tablePos = tablePosFromDom(editor, layout.table);
    if (tablePos === null || wanted === added) return added;
    const command =
      wanted > added
        ? insertTableSlice(tablePos, axis, baseLength + added, wanted - added)
        : trimTrailingEmptySlices(tablePos, axis, added - wanted);
    return command(editor.state, editor.view.dispatch) ? wanted : added;
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "pointer-events-auto absolute flex touch-none items-center justify-center rounded-dense bg-muted text-muted-foreground opacity-70 hover:bg-accent hover:text-foreground hover:opacity-100",
              isRow && "cursor-row-resize",
              !isRow && "cursor-col-resize",
              grow && "bg-accent opacity-100",
            )}
            style={box}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              store.setPinned(true);
              setGrow({
                origin: coordinate(event),
                added: 0,
                unit: averageSize(layout, axis),
                baseLength: currentLength,
              });
            }}
            onPointerMove={(event) => {
              if (!grow) return;
              const delta = coordinate(event) - grow.origin;
              const wanted = Math.max(0, Math.round(delta / grow.unit));
              const added = resize(grow.baseLength, grow.added, wanted);
              if (added !== grow.added) setGrow({ ...grow, added });
            }}
            onPointerUp={(event) => {
              if (!grow) return;
              const moved = coordinate(event) !== grow.origin;
              if (!moved && grow.added === 0) {
                resize(grow.baseLength, 0, 1);
              }
              setGrow(null);
              store.setPinned(false);
            }}
            onPointerCancel={() => {
              setGrow(null);
              store.setPinned(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              resize(currentLength, 0, 1);
            }}
          />
        }
      >
        <Plus className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side={isRow ? "bottom" : "right"}>
        {t("table.addHint")}
      </TooltipContent>
    </Tooltip>
  );
}

function DropIndicatorLine({
  layout,
  indicator,
}: {
  layout: TableLayout;
  indicator: TableDropIndicator;
}) {
  const isRow = indicator.axis === "row";
  const spans = isRow ? layout.rows : layout.columns;
  const physical =
    !isRow && layout.rtl
      ? spans.length - indicator.boundary
      : indicator.boundary;
  const edge =
    physical < spans.length
      ? spans[physical].start
      : spans[spans.length - 1].start + spans[spans.length - 1].size;
  const style = isRow
    ? {
        left: layout.clip.left,
        top: edge - INDICATOR_SIZE / 2,
        width: layout.clip.right - layout.clip.left,
        height: INDICATOR_SIZE,
      }
    : {
        left: edge - INDICATOR_SIZE / 2,
        top: layout.frame.top,
        width: INDICATOR_SIZE,
        height: layout.frame.bottom - layout.frame.top,
      };
  return <div className="absolute bg-primary" style={style} />;
}

function useTableHoverStore(
  editor: Editor,
  layerRef: RefObject<HTMLDivElement | null>,
): TableHoverStore | null {
  const [store, setStore] = useState<TableHoverStore | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const container = layer?.parentElement;
    if (!layer || !container) return;
    const created = createTableHoverStore(editor, container, layer);
    setStore(created);
    return () => {
      created.destroy();
      setStore(null);
    };
  }, [editor, layerRef]);

  return store;
}

export function TableControls({ editor }: { editor: Editor }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const store = useTableHoverStore(editor, layerRef);
  const [indicator, setIndicator] = useState<TableDropIndicator | null>(null);
  const layout = useSyncExternalStore(
    store?.subscribe ?? noStore,
    store?.getSnapshot ?? noLayout,
  );

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10">
      {layout && store ? (
        <>
          <div
            aria-hidden
            className="pointer-events-auto absolute"
            style={{
              left: layout.frame.left - HANDLE_OVERHANG,
              top: layout.frame.top,
              width: HANDLE_OVERHANG,
              height: layout.frame.bottom - layout.frame.top,
            }}
          />
          <TableSliceHandle
            key={`row-${layout.row}`}
            editor={editor}
            store={store}
            layout={layout}
            axis="row"
            layerRef={layerRef}
            onDropIndicator={setIndicator}
          />
          <TableSliceHandle
            key={`column-${layout.column}`}
            editor={editor}
            store={store}
            layout={layout}
            axis="column"
            layerRef={layerRef}
            onDropIndicator={setIndicator}
          />
          <TableAddBar
            editor={editor}
            store={store}
            layout={layout}
            axis="column"
          />
          <TableAddBar
            editor={editor}
            store={store}
            layout={layout}
            axis="row"
          />
          {indicator ? (
            <DropIndicatorLine layout={layout} indicator={indicator} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
