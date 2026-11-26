import type { NoteSummary } from "@cocurdex/shared";
import { useSetAtom, useStore } from "jotai";
import { useState } from "react";
import { ancestorIds } from "./build-note-tree";
import {
  collapsedPageIdsAtom,
  persistPagesCollapsedAtom,
  persistSectionCollapsedAtom,
  type SectionCollapse,
  sectionCollapseAtom,
} from "./note-tree-expansion-store";

function withoutIds(
  set: ReadonlySet<string>,
  ids: readonly string[],
): ReadonlySet<string> {
  if (!ids.some((id) => set.has(id))) {
    return set;
  }
  return new Set([...set].filter((id) => !ids.includes(id)));
}

function withIds(
  set: ReadonlySet<string>,
  ids: readonly string[],
): ReadonlySet<string> {
  if (ids.every((id) => set.has(id))) {
    return set;
  }
  return new Set([...set, ...ids]);
}

function expandedSection(
  sections: SectionCollapse,
  key: string | null,
): SectionCollapse {
  if (key === null || sections[key] === false) {
    return sections;
  }
  return { ...sections, [key]: false };
}

export function useNoteTreeExpansion({
  summaries,
  activeNoteId,
  activeSectionKey,
  isSectionCollapsedByDefault,
}: {
  summaries: readonly NoteSummary[];
  activeNoteId: string | null;
  activeSectionKey: string | null;
  isSectionCollapsedByDefault: (key: string) => boolean;
}) {
  const store = useStore();
  const persistPages = useSetAtom(persistPagesCollapsedAtom);
  const persistSection = useSetAtom(persistSectionCollapsedAtom);
  const revealedAncestors = activeNoteId
    ? ancestorIds(activeNoteId, summaries)
    : [];

  const [collapsedNoteIds, setCollapsedNoteIds] = useState<ReadonlySet<string>>(
    () =>
      withoutIds(new Set(store.get(collapsedPageIdsAtom)), revealedAncestors),
  );
  const [sections, setSections] = useState<SectionCollapse>(() =>
    expandedSection(store.get(sectionCollapseAtom), activeSectionKey),
  );

  const revealKey = [
    activeNoteId ?? "",
    activeSectionKey ?? "",
    ...revealedAncestors,
  ].join("\u0000");
  const [revealedKey, setRevealedKey] = useState(revealKey);
  if (revealKey !== revealedKey) {
    setRevealedKey(revealKey);
    setCollapsedNoteIds((prev) => withoutIds(prev, revealedAncestors));
    setSections((prev) => expandedSection(prev, activeSectionKey));
  }

  const isSectionCollapsed = (key: string) =>
    sections[key] ?? isSectionCollapsedByDefault(key);

  const setNotesCollapsed = (ids: readonly string[], collapsed: boolean) => {
    setCollapsedNoteIds((prev) =>
      collapsed ? withIds(prev, ids) : withoutIds(prev, ids),
    );
    persistPages({
      ids,
      collapsed,
      existingIds: new Set(summaries.map((note) => note.id)),
    });
  };

  const setSectionCollapsed = (key: string, collapsed: boolean) => {
    setSections((prev) => ({ ...prev, [key]: collapsed }));
    persistSection({ key, collapsed });
  };

  return {
    collapsedNoteIds,
    isSectionCollapsed,
    setNotesCollapsed,
    toggleNote: (id: string) =>
      setNotesCollapsed([id], !collapsedNoteIds.has(id)),
    expandNote: (id: string) => {
      if (collapsedNoteIds.has(id)) {
        setNotesCollapsed([id], false);
      }
    },
    toggleSection: (key: string) =>
      setSectionCollapsed(key, !isSectionCollapsed(key)),
    expandSection: (key: string) => {
      if (isSectionCollapsed(key)) {
        setSectionCollapsed(key, false);
      }
    },
  };
}
