import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  consumeGitRevealAtom,
  gitDiffScopeAtom,
  gitRevealAtom,
  gitSelectedPathAtom,
  revealGitFileAtom,
  reviewGitTurnAtom,
} from "@/features/editor/git-changes-store";

describe("git changes store", () => {
  it("mails a pending reveal for the requested file", () => {
    const store = createStore();

    store.set(revealGitFileAtom, "src/a.ts");

    expect(store.get(gitSelectedPathAtom)).toBe("src/a.ts");
    expect(store.get(gitRevealAtom)).toEqual({ path: "src/a.ts", token: 1 });
  });

  it("keeps the newest request when several arrive", () => {
    const store = createStore();

    store.set(revealGitFileAtom, "src/a.ts");
    store.set(revealGitFileAtom, "src/b.ts");

    expect(store.get(gitRevealAtom)).toEqual({ path: "src/b.ts", token: 2 });
  });

  it("ignores a stale consumer and clears the request for the newest one", () => {
    const store = createStore();
    store.set(revealGitFileAtom, "src/a.ts");
    store.set(revealGitFileAtom, "src/b.ts");

    store.set(consumeGitRevealAtom, 1);
    expect(store.get(gitRevealAtom)?.path).toBe("src/b.ts");

    store.set(consumeGitRevealAtom, 2);
    expect(store.get(gitRevealAtom)).toBeNull();
    // A panel that mounts afterwards must not replay the consumed request.
    expect(store.get(gitRevealAtom)).toBeNull();
  });

  it("gives each request a fresh token so a consumed one cannot swallow the next", () => {
    const store = createStore();
    store.set(revealGitFileAtom, "src/a.ts");
    const first = store.get(gitRevealAtom);
    if (first === null) throw new Error("expected a pending reveal");
    store.set(consumeGitRevealAtom, first.token);

    store.set(revealGitFileAtom, "src/b.ts");

    expect(store.get(gitRevealAtom)?.token).toBeGreaterThan(first.token);
  });

  it("reveals a reviewed turn file and switches to that turn", () => {
    const store = createStore();

    store.set(reviewGitTurnAtom, {
      sessionId: "s1",
      messageId: "m1",
      path: "src/a.ts",
    });

    expect(store.get(gitDiffScopeAtom)).toEqual({
      mode: "turn",
      sessionId: "s1",
      messageId: "m1",
    });
    expect(store.get(gitRevealAtom)?.path).toBe("src/a.ts");
  });

  it("drops the selection and any pending file when a reviewed turn has no file", () => {
    const store = createStore();
    store.set(revealGitFileAtom, "src/a.ts");

    store.set(reviewGitTurnAtom, {
      sessionId: "s1",
      messageId: "m1",
      path: "",
    });

    expect(store.get(gitSelectedPathAtom)).toBeNull();
    expect(store.get(gitRevealAtom)).toBeNull();
  });
});
