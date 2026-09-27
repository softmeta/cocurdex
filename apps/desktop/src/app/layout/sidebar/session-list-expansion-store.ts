import { atom } from "jotai";

export const SIDEBAR_SESSION_ROOT_LIMIT = 8;
const SIDEBAR_SESSION_ROOT_STEP = 10;

export const sessionRootLimitsAtom = atom<Readonly<Record<string, number>>>({});

export const showMoreSessionsAtom = atom(
  null,
  (get, set, workspaceId: string) => {
    const limits = get(sessionRootLimitsAtom);
    const current = limits[workspaceId] ?? SIDEBAR_SESSION_ROOT_LIMIT;
    set(sessionRootLimitsAtom, {
      ...limits,
      [workspaceId]: current + SIDEBAR_SESSION_ROOT_STEP,
    });
  },
);

export const resetSessionRootLimitAtom = atom(
  null,
  (get, set, workspaceId: string) => {
    const { [workspaceId]: _removed, ...rest } = get(sessionRootLimitsAtom);
    set(sessionRootLimitsAtom, rest);
  },
);
