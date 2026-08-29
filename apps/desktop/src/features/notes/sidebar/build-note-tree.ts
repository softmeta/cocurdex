import type { NoteSummary } from "@cocurdex/shared";

export interface FlatNoteNode {
  note: NoteSummary;
  depth: number;
  /** True when this folder has at least one direct child in the full tree. */
  hasChildren: boolean;
}

/**
 * Flatten the parent_id tree into a depth-annotated list for rendering.
 *
 * - Sibling order: title then id (filesystem-friendly alphabetical).
 * - Collapsed folders omit descendants from the result but still mark them
 *   visited so they do not reappear as orphans.
 * - Orphans (broken parent chain) append at depth 0 so they stay deletable.
 */
export function buildVisibleNoteTree(
  summaries: NoteSummary[],
  collapsedIds: ReadonlySet<string> = new Set(),
): FlatNoteNode[] {
  const byParent = new Map<string | null, NoteSummary[]>();
  for (const note of summaries) {
    const siblings = byParent.get(note.parentId) ?? [];
    siblings.push(note);
    byParent.set(note.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => {
      const byTitle = (a.title || a.id).localeCompare(b.title || b.id);
      return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id);
    });
  }

  const result: FlatNoteNode[] = [];
  const visited = new Set<string>();

  const markDescendantsVisited = (folderId: string) => {
    for (const child of byParent.get(folderId) ?? []) {
      visited.add(child.id);
      markDescendantsVisited(child.id);
    }
  };

  const walk = (parentId: string | null, depth: number) => {
    for (const note of byParent.get(parentId) ?? []) {
      const children = byParent.get(note.id) ?? [];
      result.push({
        note,
        depth,
        hasChildren: children.length > 0,
      });
      visited.add(note.id);
      if (note.kind === "folder" && collapsedIds.has(note.id)) {
        markDescendantsVisited(note.id);
        continue;
      }
      walk(note.id, depth + 1);
    }
  };
  walk(null, 0);

  const orphans = summaries
    .filter((note) => !visited.has(note.id))
    .sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
  for (const note of orphans) {
    result.push({
      note,
      depth: 0,
      hasChildren: (byParent.get(note.id) ?? []).length > 0,
    });
  }
  return result;
}

/** Folder ids from the note up to (but not including) the notes root. */
export function ancestorFolderIds(
  noteId: string,
  summaries: readonly NoteSummary[],
): string[] {
  const byId = new Map(summaries.map((note) => [note.id, note]));
  const result: string[] = [];
  let current = byId.get(noteId);
  while (current?.parentId) {
    result.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return result;
}

export interface MoveDestination {
  /** null = notes library root. */
  parentId: string | null;
  title: string;
}

/**
 * Valid move targets for `movingId`: library root + every folder that is not
 * the item itself, a descendant, or the current parent (no-op).
 */
export function listMoveDestinations(
  summaries: readonly NoteSummary[],
  movingId: string,
  rootLabel: string,
): MoveDestination[] {
  const moving = summaries.find((note) => note.id === movingId);
  if (!moving) {
    return [];
  }

  const blocked = new Set<string>([movingId]);
  // Block moving a folder into any of its own descendants.
  for (const note of summaries) {
    if (note.id.startsWith(`${movingId}/`)) {
      blocked.add(note.id);
    }
  }

  const destinations: MoveDestination[] = [];
  if (moving.parentId !== null) {
    destinations.push({ parentId: null, title: rootLabel });
  }

  const folders = summaries
    .filter((note) => note.kind === "folder" && !blocked.has(note.id))
    .filter((note) => note.id !== moving.parentId)
    .sort((a, b) => {
      const byTitle = (a.title || a.id).localeCompare(b.title || b.id);
      return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id);
    });

  for (const folder of folders) {
    destinations.push({
      parentId: folder.id,
      title: folder.title || folder.id,
    });
  }

  return destinations;
}

/**
 * After a folder (or note) moves, remap an open note id that lived at or under
 * the old path onto the new path.
 */
export function remapNoteIdAfterMove(
  openId: string,
  fromId: string,
  toId: string,
): string {
  if (openId === fromId) {
    return toId;
  }
  if (openId.startsWith(`${fromId}/`)) {
    return `${toId}${openId.slice(fromId.length)}`;
  }
  return openId;
}

/** Droppable id for "move to notes library root" while dragging. */
export const NOTES_ROOT_DROP_ID = "__notes_root__";

/**
 * Whether `activeId` can be moved under `parentId` (null = library root).
 * Rejects no-ops, missing parents, and folder→descendant cycles.
 */
export function canMoveNoteTo(
  summaries: readonly NoteSummary[],
  activeId: string,
  parentId: string | null,
): boolean {
  const moving = summaries.find((note) => note.id === activeId);
  if (!moving) {
    return false;
  }
  if (moving.parentId === parentId) {
    return false;
  }
  if (parentId === null) {
    return true;
  }
  if (parentId === activeId || parentId.startsWith(`${activeId}/`)) {
    return false;
  }
  const parent = summaries.find((note) => note.id === parentId);
  return parent?.kind === "folder";
}

/**
 * Map a dnd-kit `over` id to the destination parent for a hierarchy move.
 * - Root drop id → library root
 * - Folder row → that folder
 * - Note row → that note's parent (become sibling)
 * Returns `undefined` when the drop target is invalid / unknown.
 */
export function resolveDropParentId(
  summaries: readonly NoteSummary[],
  activeId: string,
  overId: string | typeof NOTES_ROOT_DROP_ID | null,
): string | null | undefined {
  if (overId === null || overId === activeId) {
    return undefined;
  }
  if (overId === NOTES_ROOT_DROP_ID) {
    return canMoveNoteTo(summaries, activeId, null) ? null : undefined;
  }

  const overNote = summaries.find((note) => note.id === overId);
  if (!overNote) {
    return undefined;
  }

  const parentId = overNote.kind === "folder" ? overNote.id : overNote.parentId;

  return canMoveNoteTo(summaries, activeId, parentId) ? parentId : undefined;
}
