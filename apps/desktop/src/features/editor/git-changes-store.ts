import { atom } from "jotai";

export const gitSelectedPathAtom = atom<string | null>(null);

export const gitRevealClockAtom = atom(0);

export const revealGitFileAtom = atom(null, (get, set, path: string) => {
  set(gitSelectedPathAtom, path);
  set(gitRevealClockAtom, get(gitRevealClockAtom) + 1);
});
