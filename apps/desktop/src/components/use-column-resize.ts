import type { MouseEvent as ReactMouseEvent } from "react";

export type ColumnResizeEdge = "inline-end" | "inline-start";

export interface BeginColumnResizeOptions {
  edge: ColumnResizeEdge;
  startWidth: number;
  onWidthChange(width: number): void;
  clamp?(width: number): number;
  onDragStart?(): void;
  onDragEnd?(finalWidth: number): void;
  stopPropagation?: boolean;
}

function isDocumentRtl(): boolean {
  return getComputedStyle(document.documentElement).direction === "rtl";
}

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
