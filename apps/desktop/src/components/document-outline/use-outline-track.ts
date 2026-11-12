import { type RefObject, useLayoutEffect, useState } from "react";
import type { DocumentHeading } from "./use-document-outline";

export interface OutlineTrackRow {
  top: number;
  bottom: number;
  depth: number;
}

const TRACK_INDENT_PX = 12;
const TRACK_BEND_PX = 4;
const TRACK_LINE_OFFSET_PX = 1;

export function outlineHeadingDepth(level: number) {
  return Math.max(0, level - 2);
}

export function outlineTrackPath(rows: readonly OutlineTrackRow[]) {
  return rows
    .map((row, index) => {
      const x = row.depth * TRACK_INDENT_PX + TRACK_LINE_OFFSET_PX;
      const previous = rows[index - 1];
      const next = rows[index + 1];
      const bendsIn = previous !== undefined && previous.depth !== row.depth;
      const bendsOut = next !== undefined && next.depth !== row.depth;
      const top = bendsIn ? row.top + TRACK_BEND_PX : row.top;
      const bottom = bendsOut ? row.bottom - TRACK_BEND_PX : row.bottom;
      return `${index === 0 ? "M" : "L"}${x} ${top}L${x} ${bottom}`;
    })
    .join("");
}

function sameRows(a: OutlineTrackRow[], b: OutlineTrackRow[]) {
  return (
    a.length === b.length &&
    a.every(
      (row, index) =>
        row.top === b[index]?.top &&
        row.bottom === b[index]?.bottom &&
        row.depth === b[index]?.depth,
    )
  );
}

function measureRows(
  list: HTMLElement,
  headings: DocumentHeading[],
): OutlineTrackRow[] {
  return Array.from(list.children, (item, index) => {
    const element = item as HTMLElement;
    return {
      top: element.offsetTop,
      bottom: element.offsetTop + element.offsetHeight,
      depth: outlineHeadingDepth(headings[index]?.level ?? 1),
    };
  });
}

export function useOutlineTrack(
  listRef: RefObject<HTMLElement | null>,
  headings: DocumentHeading[],
) {
  const [rows, setRows] = useState<OutlineTrackRow[]>([]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const update = () => {
      const next = measureRows(list, headings);
      setRows((current) => (sameRows(current, next) ? current : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => observer.disconnect();
  }, [listRef, headings]);

  return rows;
}
