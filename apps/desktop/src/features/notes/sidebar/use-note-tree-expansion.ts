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

function withoutIds(
  set: ReadonlySet<string>,
  ids: readonly string[],
): ReadonlySet<string> {
  if (!ids.some((id) => set.has(id))) {
    return set;
  }
  return new Set([...set].filter((id) => !ids.includes(id)));
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

  const [revealedNoteId, setRevealedNoteId] = useState(activeNoteId);
  if (activeNoteId !== revealedNoteId) {
    setRevealedNoteId(activeNoteId);
    if (activeNoteId) {
      setCollapsedNoteIds((prev) =>
        withoutIds(prev, ancestorIds(activeNoteId, summaries)),
      );
    }
  }

  return {
    collapsedNoteIds,
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
