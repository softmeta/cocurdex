import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

const COLLAPSED_PAGES_STORAGE_KEY = "cocurdex.notes.collapsed-pages";
const SECTION_COLLAPSE_STORAGE_KEY = "cocurdex.notes.section-collapse";

export type SectionCollapse = Readonly<Record<string, boolean>>;

function normalizeCollapsedPageIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeSectionCollapse(value: unknown): SectionCollapse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

const storedCollapsedPageIdsAtom = atomWithStorage<unknown>(
  COLLAPSED_PAGES_STORAGE_KEY,
  [],
  undefined,
  { getOnInit: true },
);

const storedSectionCollapseAtom = atomWithStorage<unknown>(
  SECTION_COLLAPSE_STORAGE_KEY,
  {},
  undefined,
  { getOnInit: true },
);

export const collapsedPageIdsAtom = atom((get) =>
  normalizeCollapsedPageIds(get(storedCollapsedPageIdsAtom)),
);

export const sectionCollapseAtom = atom((get) =>
  normalizeSectionCollapse(get(storedSectionCollapseAtom)),
);

export const persistPagesCollapsedAtom = atom(
  null,
  (
    get,
    set,
    change: {
      ids: readonly string[];
      collapsed: boolean;
      existingIds: ReadonlySet<string>;
    },
  ) => {
    const changed = new Set(change.ids);
    const kept = get(collapsedPageIdsAtom).filter(
      (id) => !changed.has(id) && change.existingIds.has(id),
    );
    set(
      storedCollapsedPageIdsAtom,
      change.collapsed ? [...kept, ...changed] : kept,
    );
  },
);

export const persistSectionCollapsedAtom = atom(
  null,
  (get, set, change: { key: string; collapsed: boolean }) => {
    set(storedSectionCollapseAtom, {
      ...get(sectionCollapseAtom),
      [change.key]: change.collapsed,
    });
  },
);
