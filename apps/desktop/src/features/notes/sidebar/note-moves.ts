import { compareNoteSiblings, type NoteSummary } from "@cocurdex/shared";
import { ancestorIds } from "./build-note-tree";

interface NotePlacement {
  beforeId?: string;
  afterId?: string;
}

export type NoteMoveTarget =
  | ({ parentId: string } & NotePlacement)
  | ({ parentId: null; workspaceId: string | null } & NotePlacement);

export type NoteDropZone = "before" | "inside" | "after";

export function dropZoneAt(
  pointerY: number,
  rect: { top: number; height: number },
): NoteDropZone {
  const offset = (pointerY - rect.top) / rect.height;
  if (offset < 0.3) {
    return "before";
  }
  return offset > 0.7 ? "after" : "inside";
}

export interface MoveDestination {
  target: NoteMoveTarget;
  title: string;
}

const SECTION_DROP_PREFIX = "__notes_section__:";

export function sectionDropId(workspaceId: string | null): string {
  return `${SECTION_DROP_PREFIX}${workspaceId ?? ""}`;
}

function parseSectionDropId(id: string): NoteMoveTarget | null {
  if (!id.startsWith(SECTION_DROP_PREFIX)) {
    return null;
  }
  const workspaceId = id.slice(SECTION_DROP_PREFIX.length);
  return { parentId: null, workspaceId: workspaceId || null };
}

export function canMoveNoteTo(
  summaries: readonly NoteSummary[],
  movingId: string,
  target: NoteMoveTarget,
): boolean {
  const moving = summaries.find((note) => note.id === movingId);
  if (!moving) {
    return false;
  }
  if (target.parentId === null) {
    return (
      moving.parentId !== null || moving.workspaceId !== target.workspaceId
    );
  }
  if (target.parentId === moving.parentId || target.parentId === movingId) {
    return false;
  }
  if (!summaries.some((note) => note.id === target.parentId)) {
    return false;
  }
  return !ancestorIds(target.parentId, summaries).includes(movingId);
}

function sortedChildren(
  summaries: readonly NoteSummary[],
  parentId: string,
): NoteSummary[] {
  return summaries
    .filter((note) => note.parentId === parentId)
    .sort(compareNoteSiblings);
}

function placeBeside(
  summaries: readonly NoteSummary[],
  movingId: string,
  anchor: NoteSummary,
  side: "before" | "after",
): NoteMoveTarget | undefined {
  if (
    anchor.id === movingId ||
    ancestorIds(anchor.id, summaries).includes(movingId)
  ) {
    return undefined;
  }
  const { parentId } = anchor;
  if (parentId !== null && !summaries.some((note) => note.id === parentId)) {
    return undefined;
  }
  const siblings =
    parentId === null
      ? summaries
          .filter(
            (note) =>
              note.parentId === null && note.workspaceId === anchor.workspaceId,
          )
          .sort(compareNoteSiblings)
      : sortedChildren(summaries, parentId);
  const movingIndex = siblings.findIndex((note) => note.id === movingId);
  const anchorIndex = siblings.indexOf(anchor);
  const neighborIndex = side === "before" ? anchorIndex - 1 : anchorIndex + 1;
  if (movingIndex >= 0 && movingIndex === neighborIndex) {
    return undefined;
  }
  const placement =
    side === "before" ? { beforeId: anchor.id } : { afterId: anchor.id };
  return parentId === null
    ? { parentId: null, workspaceId: anchor.workspaceId, ...placement }
    : { parentId, ...placement };
}

export function resolveDropTarget(
  summaries: readonly NoteSummary[],
  movingId: string,
  overId: string | null,
  zone: NoteDropZone = "inside",
  collapsedIds: ReadonlySet<string> = new Set(),
): NoteMoveTarget | undefined {
  if (overId === null) {
    return undefined;
  }
  const sectionTarget = parseSectionDropId(overId);
  const over = summaries.find((note) => note.id === overId);
  if (sectionTarget || !over || zone === "inside") {
    const target = sectionTarget ?? { parentId: overId };
    return canMoveNoteTo(summaries, movingId, target) ? target : undefined;
  }
  const firstChild = collapsedIds.has(over.id)
    ? undefined
    : sortedChildren(summaries, over.id)[0];
  if (zone === "after" && firstChild) {
    return placeBeside(summaries, movingId, firstChild, "before");
  }
  return placeBeside(summaries, movingId, over, zone);
}

export function listMoveDestinations(
  summaries: readonly NoteSummary[],
  movingId: string,
  sections: readonly { workspaceId: string | null; title: string }[],
): MoveDestination[] {
  const sectionDestinations = sections
    .map((section) => ({
      target: {
        parentId: null,
        workspaceId: section.workspaceId,
      } satisfies NoteMoveTarget,
      title: section.title,
    }))
    .filter((destination) =>
      canMoveNoteTo(summaries, movingId, destination.target),
    );
  const pageDestinations = summaries
    .filter((note) => canMoveNoteTo(summaries, movingId, { parentId: note.id }))
    .sort((left, right) =>
      (left.title || left.id).localeCompare(right.title || right.id),
    )
    .map((note) => ({
      target: { parentId: note.id } satisfies NoteMoveTarget,
      title: note.title || note.id,
    }));
  return [...sectionDestinations, ...pageDestinations];
}
