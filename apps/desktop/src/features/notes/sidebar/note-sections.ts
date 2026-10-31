import type { NoteSummary } from "@cocurdex/shared";
import { rootNote } from "./build-note-tree";

export interface NoteSection {
  workspaceId: string | null;
  notes: NoteSummary[];
}

export function noteSectionId(
  note: NoteSummary,
  summaries: readonly NoteSummary[],
  workspaceIds: ReadonlySet<string>,
): string | null {
  const workspaceId = rootNote(note, summaries).workspaceId;
  return workspaceId && workspaceIds.has(workspaceId) ? workspaceId : null;
}

export function groupNoteSections(
  summaries: readonly NoteSummary[],
  workspaces: readonly { id: string }[],
  activeWorkspaceId: string | null,
): NoteSection[] {
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const bySection = new Map<string | null, NoteSummary[]>();
  for (const note of summaries) {
    const sectionId = noteSectionId(note, summaries, workspaceIds);
    bySection.set(sectionId, [...(bySection.get(sectionId) ?? []), note]);
  }
  const workspaceSections = workspaces
    .filter(
      (workspace) =>
        bySection.has(workspace.id) || workspace.id === activeWorkspaceId,
    )
    .map((workspace) => ({
      workspaceId: workspace.id,
      notes: bySection.get(workspace.id) ?? [],
    }));
  return [
    ...workspaceSections,
    { workspaceId: null, notes: bySection.get(null) ?? [] },
  ];
}
