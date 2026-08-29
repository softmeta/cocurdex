import { atom } from "jotai";

/**
 * False until the persisted snapshot has been applied to the stores. Empty
 * stores are indistinguishable from "no projects yet", so surfaces that own an
 * empty state render nothing while this is false instead of flashing the
 * new-user surface on every launch. Also set on bootstrap failure so a broken
 * IPC leaves a usable (if empty) UI rather than a blank window.
 */
export const appBootstrappedAtom = atom(false);
