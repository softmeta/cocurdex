import type { NoteSummary } from "@cocurdex/shared";
import { useState } from "react";
import { ancestorIds } from "./build-note-tree";

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function useNoteTreeExpansion({
  summaries,
  activeNoteId,
  initiallyCollapsedSections,
}: {
  summaries: readonly NoteSummary[];
  activeNoteId: string | null;
  initiallyCollapsedSections: () => Iterable<string>;
}) {
  const [collapsedNoteIds, setCollapsedNoteIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [collapsedSections, setCollapsedSections] = useState<
    ReadonlySet<string>
  >(() => new Set(initiallyCollapsedSections()));

  const forcedOpen = activeNoteId ? ancestorIds(activeNoteId, summaries) : [];
  const effectiveCollapsedNoteIds = new Set(
    [...collapsedNoteIds].filter((id) => !forcedOpen.includes(id)),
  );

  return {
    collapsedNoteIds: effectiveCollapsedNoteIds,
    isSectionCollapsed: (key: string) => collapsedSections.has(key),
    toggleNote: (id: string) =>
      setCollapsedNoteIds((prev) => toggled(prev, id)),
    toggleSection: (key: string) =>
      setCollapsedSections((prev) => toggled(prev, key)),
    expandNote: (id: string) =>
      setCollapsedNoteIds((prev) => {
        if (!prev.has(id)) {
          return prev;
        }
        return toggled(prev, id);
      }),
    expandSection: (key: string) =>
      setCollapsedSections((prev) => {
        if (!prev.has(key)) {
          return prev;
        }
        return toggled(prev, key);
      }),
  };
}
