import { describe, expect, it } from "vitest";
import {
  isMutableScope,
  isWorkingTreeScope,
  pickDefaultSourceRef,
  pickDefaultTargetRef,
  resolveBranchScope,
  resolveCommitScope,
  scopeKey,
  scopeToQuery,
} from "@/features/editor/git-diff-scope";
import type { GitBranchInfo } from "@/lib";

function ref(
  name: string,
  options: { current?: boolean; kind?: GitBranchInfo["kind"] } = {},
): GitBranchInfo {
  return {
    name,
    current: options.current ?? false,
    kind: options.kind ?? "local",
  };
}

describe("isMutableScope", () => {
  it("allows stage/discard only on worktree scopes", () => {
    expect(isMutableScope({ mode: "working" })).toBe(true);
    expect(isMutableScope({ mode: "unstaged" })).toBe(true);
    expect(isMutableScope({ mode: "staged" })).toBe(true);
    expect(isMutableScope({ mode: "commit", commit: "abc" })).toBe(false);
    expect(
      isMutableScope({ mode: "branch", source: "dev", target: "main" }),
    ).toBe(false);
  });
});

describe("isWorkingTreeScope", () => {
  it("matches mutable scopes", () => {
    expect(isWorkingTreeScope({ mode: "working" })).toBe(true);
    expect(isWorkingTreeScope({ mode: "commit", commit: "abc" })).toBe(false);
  });
});

describe("pickDefaultSourceRef", () => {
  it("prefers the current local branch", () => {
    expect(
      pickDefaultSourceRef([
        ref("main"),
        ref("dev", { current: true }),
        ref("origin/main", { kind: "remote" }),
      ]),
    ).toBe("dev");
  });

  it("falls back to first local then first ref", () => {
    expect(
      pickDefaultSourceRef([
        ref("origin/main", { kind: "remote" }),
        ref("feature"),
      ]),
    ).toBe("feature");
    expect(pickDefaultSourceRef([ref("origin/main", { kind: "remote" })])).toBe(
      "origin/main",
    );
  });
});

describe("pickDefaultTargetRef", () => {
  it("prefers origin/main then main then master", () => {
    expect(
      pickDefaultTargetRef([
        ref("dev", { current: true }),
        ref("origin/main", { kind: "remote" }),
      ]),
    ).toBe("origin/main");
    expect(pickDefaultTargetRef([ref("dev"), ref("main")])).toBe("main");
    expect(pickDefaultTargetRef([ref("dev"), ref("master")])).toBe("master");
  });

  it("falls back to a non-current local branch", () => {
    expect(
      pickDefaultTargetRef([ref("feature", { current: true }), ref("dev")]),
    ).toBe("dev");
  });

  it("returns null for an empty list", () => {
    expect(pickDefaultTargetRef([])).toBeNull();
  });
});

describe("resolveBranchScope", () => {
  it("defaults to current source → origin/main target", () => {
    expect(
      resolveBranchScope(
        [
          ref("main"),
          ref("dev", { current: true }),
          ref("origin/main", { kind: "remote" }),
        ],
        null,
      ),
    ).toEqual({ mode: "branch", source: "dev", target: "origin/main" });
  });

  it("reuses previous source/target when still present", () => {
    expect(
      resolveBranchScope(
        [ref("main"), ref("dev", { current: true }), ref("feature")],
        { mode: "branch", source: "feature", target: "main" },
      ),
    ).toEqual({ mode: "branch", source: "feature", target: "main" });
  });

  it("avoids source === target when another ref exists", () => {
    const scope = resolveBranchScope(
      [ref("only", { current: true }), ref("other")],
      { mode: "branch", source: "only", target: "only" },
    );
    expect(scope.source).not.toBe(scope.target);
  });
});

describe("resolveCommitScope / scopeKey / scopeToQuery", () => {
  it("wraps a commit hash", () => {
    expect(resolveCommitScope("abc123")).toEqual({
      mode: "commit",
      commit: "abc123",
    });
  });

  it("builds a stable key per scope", () => {
    expect(scopeKey({ mode: "working" })).toBe("working");
    expect(scopeKey({ mode: "commit", commit: "abc" })).toBe("commit:abc");
    expect(scopeKey({ mode: "branch", source: "dev", target: "main" })).toBe(
      "branch:dev->main",
    );
  });

  it("passes scope through as the IPC query", () => {
    const scope = { mode: "staged" as const };
    expect(scopeToQuery(scope)).toBe(scope);
  });
});
