import { atom } from "jotai";
import { GIT_DEFAULT_DIFF_SCOPE, type GitDiffScope } from "./git-diff-scope";

export const gitSelectedPathAtom = atom<string | null>(null);

export const gitRevealClockAtom = atom(0);

export const gitDiffScopeAtom = atom<GitDiffScope>(GIT_DEFAULT_DIFF_SCOPE);

export const revealGitFileAtom = atom(null, (get, set, path: string) => {
  set(gitSelectedPathAtom, path);
  set(gitRevealClockAtom, get(gitRevealClockAtom) + 1);
});

export const reviewGitTurnAtom = atom(
  null,
  (get, set, input: { sessionId: string; messageId: string; path: string }) => {
    set(gitDiffScopeAtom, {
      mode: "turn",
      sessionId: input.sessionId,
      messageId: input.messageId,
    });
    set(gitSelectedPathAtom, input.path || null);
    set(gitRevealClockAtom, get(gitRevealClockAtom) + 1);
  },
);
