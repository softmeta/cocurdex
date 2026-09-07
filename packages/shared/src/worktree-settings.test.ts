import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKTREE_SETTINGS,
  groupManagedWorktrees,
  parseWorktreeSettings,
  serializeWorktreeSettings,
  sessionsUsingWorktreePath,
} from "./worktree-settings";

describe("parseWorktreeSettings", () => {
  it("uses defaults for missing or invalid input", () => {
    expect(parseWorktreeSettings(null)).toEqual(DEFAULT_WORKTREE_SETTINGS);
    expect(parseWorktreeSettings("not-json")).toEqual(
      DEFAULT_WORKTREE_SETTINGS,
    );
    expect(parseWorktreeSettings("[]")).toEqual(DEFAULT_WORKTREE_SETTINGS);
  });

  it("round-trips an absolute root and fetch flag", () => {
    const parsed = parseWorktreeSettings(
      serializeWorktreeSettings({
        rootPath: " /Users/me/worktrees ",
        fetchBeforeCreate: true,
      }),
    );
    expect(parsed).toEqual({
      rootPath: "/Users/me/worktrees",
      fetchBeforeCreate: true,
    });
  });

  it("drops relative or empty root paths", () => {
    expect(
      parseWorktreeSettings(
        serializeWorktreeSettings({
          rootPath: "worktrees",
          fetchBeforeCreate: false,
        }),
      ).rootPath,
    ).toBeNull();
    expect(
      parseWorktreeSettings(
        JSON.stringify({ rootPath: "   ", fetchBeforeCreate: true }),
      ),
    ).toEqual({
      rootPath: null,
      fetchBeforeCreate: true,
    });
  });
});

describe("sessionsUsingWorktreePath", () => {
  it("matches active and archived sessions on the same checkout", () => {
    const bound = sessionsUsingWorktreePath(
      [
        {
          id: "a",
          title: "Live",
          worktreePath: "/tmp/worktrees/one",
          archivedAt: null,
        },
        {
          id: "b",
          title: "Old",
          worktreePath: "/tmp/worktrees/one/",
          archivedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "c",
          title: "Other",
          worktreePath: "/tmp/worktrees/two",
        },
        {
          id: "d",
          title: "Main",
          worktreePath: null,
        },
      ],
      "/tmp/worktrees/one",
    );

    expect(bound).toEqual([
      { id: "a", title: "Live", archived: false },
      { id: "b", title: "Old", archived: true },
    ]);
  });
});

describe("groupManagedWorktrees", () => {
  it("groups checkouts by workspace in first-seen order", () => {
    const groups = groupManagedWorktrees([
      {
        workspaceId: "w2",
        workspaceName: "beta",
        workspaceRootPath: "/repos/beta",
        path: "/wt/beta-1",
        branch: "cocurdex/a",
        head: "aaa",
        detached: false,
        sessions: [],
      },
      {
        workspaceId: "w1",
        workspaceName: "alpha",
        workspaceRootPath: "/repos/alpha",
        path: "/wt/alpha-1",
        branch: "cocurdex/b",
        head: "bbb",
        detached: false,
        sessions: [],
      },
      {
        workspaceId: "w2",
        workspaceName: "beta",
        workspaceRootPath: "/repos/beta",
        path: "/wt/beta-2",
        branch: null,
        head: "ccc",
        detached: true,
        sessions: [],
      },
    ]);

    expect(groups.map((group) => group.workspaceId)).toEqual(["w2", "w1"]);
    expect(groups[0]?.worktrees.map((item) => item.path)).toEqual([
      "/wt/beta-1",
      "/wt/beta-2",
    ]);
  });
});
