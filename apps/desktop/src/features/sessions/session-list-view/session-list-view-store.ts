import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import {
  normalizeSessionListView,
  type SessionListView,
} from "./session-list-view-model";

const SESSION_LIST_VIEW_STORAGE_KEY = "cocurdex.sidebar.session-list-view";
const COLLAPSED_SESSION_GROUPS_STORAGE_KEY =
  "cocurdex.sidebar.collapsed-session-groups";

const storedSessionListViewAtom = atomWithStorage<unknown>(
  SESSION_LIST_VIEW_STORAGE_KEY,
  null,
  undefined,
  { getOnInit: true },
);

export const sessionListViewAtom = atom(
  (get) => normalizeSessionListView(get(storedSessionListViewAtom)),
  (get, set, update: Partial<SessionListView>) => {
    const current = normalizeSessionListView(get(storedSessionListViewAtom));
    set(storedSessionListViewAtom, { ...current, ...update });
  },
);

const storedCollapsedSessionGroupsAtom = atomWithStorage<unknown>(
  COLLAPSED_SESSION_GROUPS_STORAGE_KEY,
  [],
  undefined,
  { getOnInit: true },
);

export const collapsedSessionGroupKeysAtom = atom(
  (get) => {
    const stored = get(storedCollapsedSessionGroupsAtom);
    return new Set(
      Array.isArray(stored)
        ? stored.filter((key): key is string => typeof key === "string")
        : [],
    );
  },
  (_get, set, keys: ReadonlySet<string>) => {
    set(storedCollapsedSessionGroupsAtom, [...keys]);
  },
);
