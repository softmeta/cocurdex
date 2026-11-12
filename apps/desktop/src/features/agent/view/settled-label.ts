export const LABEL_ENTER_MS = 400;
export const LABEL_HOLD_MS = 800;

export type SettledLabel<T> = {
  key: string;
  value: T;
  shownAt: number;
  pending: { key: string; value: T; since: number } | null;
};

export function initialSettledLabel<T>(
  key: string,
  value: T,
  now: number,
): SettledLabel<T> {
  return { key, value, shownAt: now, pending: null };
}

export function settleLabel<T>(
  state: SettledLabel<T>,
  key: string,
  value: T,
  now: number,
): { state: SettledLabel<T>; wakeAt: number | null } {
  if (key === state.key) {
    return {
      state: state.pending ? { ...state, pending: null } : state,
      wakeAt: null,
    };
  }
  const pending =
    state.pending?.key === key ? state.pending : { key, value, since: now };
  const switchAt = Math.max(
    pending.since + LABEL_ENTER_MS,
    state.shownAt + LABEL_HOLD_MS,
  );
  if (now >= switchAt) {
    return { state: initialSettledLabel(key, value, now), wakeAt: null };
  }
  return {
    state: pending === state.pending ? state : { ...state, pending },
    wakeAt: switchAt,
  };
}
