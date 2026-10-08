import type { NoteSummary } from "@cocurdex/shared";

export interface FlatNoteNode {
  note: NoteSummary;
  depth: number;
  hasChildren: boolean;
}

export function compareNotes(left: NoteSummary, right: NoteSummary): number {
  const byTitle = (left.title || left.id).localeCompare(
    right.title || right.id,
  );
  return byTitle !== 0 ? byTitle : left.id.localeCompare(right.id);
}

export function buildVisibleNoteTree(
  summaries: readonly NoteSummary[],
  collapsedIds: ReadonlySet<string> = new Set(),
): FlatNoteNode[] {
  const byParent = new Map<string | null, NoteSummary[]>();
  for (const note of summaries) {
    const siblings = byParent.get(note.parentId) ?? [];
    siblings.push(note);
    byParent.set(note.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort(compareNotes);
  }

  const result: FlatNoteNode[] = [];
  const visited = new Set<string>();

  const markVisited = (parentId: string) => {
    for (const child of byParent.get(parentId) ?? []) {
      visited.add(child.id);
      markVisited(child.id);
    }
  };

  const walk = (parentId: string | null, depth: number) => {
    for (const note of byParent.get(parentId) ?? []) {
      if (visited.has(note.id)) {
        continue;
      }
      visited.add(note.id);
      result.push({
        note,
        depth,
        hasChildren: (byParent.get(note.id) ?? []).length > 0,
      });
      if (collapsedIds.has(note.id)) {
        markVisited(note.id);
        continue;
      }
      walk(note.id, depth + 1);
    }
  };
  walk(null, 0);

  const orphans = summaries
    .filter((note) => !visited.has(note.id))
    .sort(compareNotes);
  for (const note of orphans) {
    if (visited.has(note.id)) {
      continue;
    }
    visited.add(note.id);
    result.push({
      note,
      depth: 0,
      hasChildren: (byParent.get(note.id) ?? []).length > 0,
    });
    if (collapsedIds.has(note.id)) {
      markVisited(note.id);
    } else {
      walk(note.id, 1);
    }
  }
  return result;
}

export function ancestorIds(
  noteId: string,
  summaries: readonly NoteSummary[],
): string[] {
  const byId = new Map(summaries.map((note) => [note.id, note]));
  const result: string[] = [];
  let current = byId.get(noteId);
  while (current?.parentId && !result.includes(current.parentId)) {
    result.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return result;
}

export function rootNote(
  note: NoteSummary,
  summaries: readonly NoteSummary[],
): NoteSummary {
  const byId = new Map(summaries.map((candidate) => [candidate.id, candidate]));
  let root = note;
  for (const id of ancestorIds(note.id, summaries)) {
    const ancestor = byId.get(id);
    if (!ancestor) {
      break;
    }
    root = ancestor;
  }
  return root;
}
