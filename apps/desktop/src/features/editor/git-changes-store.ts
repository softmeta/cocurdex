import { atom } from "jotai";
import { GIT_DEFAULT_DIFF_SCOPE, type GitDiffScope } from "./git-diff-scope";

export interface GitFileReveal {
  path: string;
  token: number;
}

export const gitSelectedPathAtom = atom<string | null>(null);

export const gitRevealAtom = atom<GitFileReveal | null>(null);

const gitRevealTokenAtom = atom(0);

export const gitDiffScopeAtom = atom<GitDiffScope>(GIT_DEFAULT_DIFF_SCOPE);

export const revealGitFileAtom = atom(null, (get, set, path: string) => {
  set(gitSelectedPathAtom, path);
  const token = get(gitRevealTokenAtom) + 1;
  set(gitRevealTokenAtom, token);
  set(gitRevealAtom, { path, token });
});

export const consumeGitRevealAtom = atom(null, (get, set, token: number) => {
  if (get(gitRevealAtom)?.token === token) {
    set(gitRevealAtom, null);
  }
});

export const reviewGitTurnAtom = atom(
  null,
  (
    _get,
    set,
    input: { sessionId: string; messageId: string; path: string },
  ) => {
    set(gitDiffScopeAtom, {
      mode: "turn",
      sessionId: input.sessionId,
      messageId: input.messageId,
    });
    if (input.path) {
      set(revealGitFileAtom, input.path);
    } else {
      set(gitSelectedPathAtom, null);
      set(gitRevealAtom, null);
    }
  },
);
