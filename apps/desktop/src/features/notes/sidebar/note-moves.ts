import type { NoteSummary } from "@cocurdex/shared";
import { ancestorIds, compareNotes } from "./build-note-tree";

export type NoteMoveTarget =
  | { parentId: string }
  | { parentId: null; workspaceId: string | null };

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

export function resolveDropTarget(
  summaries: readonly NoteSummary[],
  movingId: string,
  overId: string | null,
): NoteMoveTarget | undefined {
  if (overId === null) {
    return undefined;
  }
  const target = parseSectionDropId(overId) ?? { parentId: overId };
  return canMoveNoteTo(summaries, movingId, target) ? target : undefined;
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
    .sort(compareNotes)
    .map((note) => ({
      target: { parentId: note.id } satisfies NoteMoveTarget,
      title: note.title || note.id,
    }));
  return [...sectionDestinations, ...pageDestinations];
}
