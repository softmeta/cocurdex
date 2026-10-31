import type { NoteSummary, WorkspaceRecord } from "@cocurdex/shared";

export interface NoteRow {
  note: NoteSummary;
  depth: number;
}

export interface NoteSection {
  workspace: WorkspaceRecord | null;
  rows: NoteRow[];
}

function bySortOrder(left: NoteSummary, right: NoteSummary) {
  return (
    left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)
  );
}

function treeRows(notes: readonly NoteSummary[]): NoteRow[] {
  const ids = new Set(notes.map((note) => note.id));
  const children = new Map<string | null, NoteSummary[]>();
  for (const note of notes) {
    const parent =
      note.parentId && ids.has(note.parentId) ? note.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), note]);
  }
  const rows: NoteRow[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const note of [...(children.get(parent) ?? [])].sort(bySortOrder)) {
      rows.push({ note, depth });
      visit(note.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

function searchRows(notes: readonly NoteSummary[], needle: string): NoteRow[] {
  return notes
    .filter(
      (note) =>
        note.kind === "note" && note.title.toLocaleLowerCase().includes(needle),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((note) => ({ note, depth: 0 }));
}

export function noteSections(
  notes: readonly NoteSummary[],
  workspaces: readonly WorkspaceRecord[],
  query: string,
): NoteSection[] {
  const needle = query.trim().toLocaleLowerCase();
  const known = new Set(workspaces.map((workspace) => workspace.id));
  const groups: (WorkspaceRecord | null)[] = [...workspaces, null];
  return groups
    .map((workspace) => {
      const members = notes.filter((note) =>
        workspace
          ? note.workspaceId === workspace.id
          : note.workspaceId === null || !known.has(note.workspaceId),
      );
      return {
        workspace,
        rows: needle ? searchRows(members, needle) : treeRows(members),
      };
    })
    .filter((section) => section.rows.length > 0);
}

export function parentNoteChoices(
  notes: readonly NoteSummary[],
  noteId: string,
): NoteSummary[] {
  const self = notes.find((note) => note.id === noteId);
  if (!self) return [];
  const peers = notes.filter((note) => note.workspaceId === self.workspaceId);
  const excluded = new Set([noteId]);
  for (const row of treeRows(peers)) {
    if (row.note.parentId && excluded.has(row.note.parentId)) {
      excluded.add(row.note.id);
    }
  }
  return treeRows(peers)
    .map((row) => row.note)
    .filter((note) => !excluded.has(note.id));
}
