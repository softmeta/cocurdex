import type { MouseEvent as ReactMouseEvent } from "react";

/**
 * Which logical edge of the resizable column the drag handle sits on.
 *
 * - `inline-end`: left sidebar / explorer / notes (LTR: drag right → wider)
 * - `inline-start`: right panel / pinned chat (LTR: drag left → wider)
 *
 * RTL flips the physical pointer delta so growth stays on the logical axis.
 */
export type ColumnResizeEdge = "inline-end" | "inline-start";

export interface BeginColumnResizeOptions {
  edge: ColumnResizeEdge;
  startWidth: number;
  onWidthChange(width: number): void;
  /** Clamp on every move / mouseup. Defaults to identity. */
  clamp?(width: number): number;
  onDragStart?(): void;
  onDragEnd?(finalWidth: number): void;
  stopPropagation?: boolean;
}

function isDocumentRtl(): boolean {
  return getComputedStyle(document.documentElement).direction === "rtl";
}

/**
 * Shared left/right column drag. Sets body cursor + user-select for the drag,
 * tracks pointer delta in logical inline direction, and returns a cancel fn
 * (e.g. unmount mid-drag).
 */
export function beginColumnResize(
  event: ReactMouseEvent,
  {
    edge,
    startWidth,
    onWidthChange,
    clamp = (width) => width,
    onDragStart,
    onDragEnd,
    stopPropagation = false,
  }: BeginColumnResizeOptions,
): () => void {
  event.preventDefault();
  if (stopPropagation) {
    event.stopPropagation();
  }

  const startX = event.clientX;
  const edgeSign = edge === "inline-end" ? 1 : -1;
  const rtlSign = isDocumentRtl() ? -1 : 1;

  const compute = (clientX: number) => {
    const delta = (clientX - startX) * edgeSign * rtlSign;
    return clamp(startWidth + delta);
  };

  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  onDragStart?.();

  let finished = false;

  const finish = (clientX: number | null, notifyEnd: boolean) => {
    if (finished) {
      return;
    }
    finished = true;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (clientX !== null) {
      const finalWidth = compute(clientX);
      onWidthChange(finalWidth);
      if (notifyEnd) {
        onDragEnd?.(finalWidth);
      }
      return;
    }
    if (notifyEnd) {
      onDragEnd?.(clamp(startWidth));
    }
  };

  const onMove = (moveEvent: MouseEvent) => {
    onWidthChange(compute(moveEvent.clientX));
  };

  const onUp = (upEvent: MouseEvent) => {
    finish(upEvent.clientX, true);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  return () => finish(null, false);
}
