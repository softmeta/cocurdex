import { atom } from "jotai";

const SIDEBAR_SESSION_ROOT_STEP = 10;

export const sessionRootLimitsAtom = atom<Readonly<Record<string, number>>>({});

export const showMoreSessionsAtom = atom(
  null,
  (get, set, payload: { listKey: string; baseLimit: number }) => {
    const limits = get(sessionRootLimitsAtom);
    const current = limits[payload.listKey] ?? payload.baseLimit;
    set(sessionRootLimitsAtom, {
      ...limits,
      [payload.listKey]: current + SIDEBAR_SESSION_ROOT_STEP,
    });
  },
);

export const resetSessionRootLimitAtom = atom(
  null,
  (get, set, listKey: string) => {
    const { [listKey]: _removed, ...rest } = get(sessionRootLimitsAtom);
    set(sessionRootLimitsAtom, rest);
  },
);

export const resetAllSessionRootLimitsAtom = atom(null, (_get, set) => {
  set(sessionRootLimitsAtom, {});
});
