import type { SessionRecord } from "@cocurdex/shared";
import {
  DEFAULT_SESSION_LIST_VIEW,
  filterSessionsByView,
  groupSessionsByView,
  normalizeSessionListView,
  type SessionListFacts,
  sessionUpdatedBucket,
  splitPinnedSessions,
  visibleSessionProperties,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function session(
  partial: Pick<SessionRecord, "id"> & Partial<SessionRecord>,
): SessionRecord {
  return {
    agentType: "codex",
    sessionModeId: null,
    createdAt: "2026-10-08T08:00:00.000Z",
    lastMessageAt: null,
    parentSessionId: null,
    status: "idle",
    title: partial.id,
    updatedAt: "2026-10-08T08:00:00.000Z",
    workspaceId: "workspace-1",
    writeMode: "native-write",
    ...partial,
  };
}

const noFacts: SessionListFacts = {
  attentionIds: new Set(),
  issueLinkedIds: new Set(),
  unreadIds: new Set(),
};

describe("normalizeSessionListView", () => {
  it("falls back to defaults for unknown stored values", () => {
    expect(normalizeSessionListView({ grouping: "repo", agents: [1] })).toEqual(
      DEFAULT_SESSION_LIST_VIEW,
    );
  });

  it("keeps agent ids of persisted sessions that are no longer registered", () => {
    expect(
      normalizeSessionListView({ agents: ["antigravity", "codex", ""] }).agents,
    ).toEqual(["antigravity", "codex"]);
  });

  it("keeps valid choices and drops duplicates", () => {
    expect(
      normalizeSessionListView({
        grouping: "status",
        statuses: ["running", "running", "bogus"],
        rootLimit: "all",
      }),
    ).toMatchObject({
      grouping: "status",
      statuses: ["running"],
      rootLimit: "all",
    });
  });

  it("shows only timestamps until properties are chosen", () => {
    expect(normalizeSessionListView(null).properties).toEqual(["timestamp"]);
  });

  it("keeps an explicitly empty property selection", () => {
    expect(normalizeSessionListView({ properties: [] }).properties).toEqual([]);
  });

  it("starts outside compact mode and keeps a stored compact choice", () => {
    expect(normalizeSessionListView(null).compact).toBe(false);
    expect(normalizeSessionListView({ compact: true }).compact).toBe(true);
    expect(normalizeSessionListView({ compact: "yes" }).compact).toBe(false);
  });

  it("keeps known properties in display order", () => {
    expect(
      normalizeSessionListView({
        properties: ["worktree", "bogus", "agent", "agent", "timestamp"],
      }).properties,
    ).toEqual(["timestamp", "agent", "worktree"]);
  });
});

describe("filterSessionsByView", () => {
  const parent = session({ id: "parent" });
  const child = session({
    id: "child",
    parentSessionId: "parent",
    status: "running",
  });
  const worktree = session({ id: "worktree", worktreePath: "/tmp/wt" });
  const imported = session({
    id: "imported",
    agentType: "claude-agent",
    importedProviderSessionId: "provider-1",
  });
  const sessions = [parent, child, worktree, imported];

  it("keeps a whole tree when a descendant makes its root match", () => {
    const view = {
      ...DEFAULT_SESSION_LIST_VIEW,
      statuses: ["running" as const],
    };
    expect(
      filterSessionsByView(sessions, view, noFacts).map(({ id }) => id),
    ).toEqual(["parent", "child"]);
  });

  it("combines filters across dimensions", () => {
    const view = {
      ...DEFAULT_SESSION_LIST_VIEW,
      environments: ["local" as const],
      sources: ["imported" as const],
    };
    expect(
      filterSessionsByView(sessions, view, noFacts).map(({ id }) => id),
    ).toEqual(["imported"]);
  });

  it("classifies issue-linked sessions before imported ones", () => {
    const view = { ...DEFAULT_SESSION_LIST_VIEW, sources: ["issue" as const] };
    const facts = { ...noFacts, issueLinkedIds: new Set(["imported"]) };
    expect(
      filterSessionsByView(sessions, view, facts).map(({ id }) => id),
    ).toEqual(["imported"]);
  });
});

describe("groupSessionsByView", () => {
  it("orders status groups by urgency and skips empty ones", () => {
    const sessions = [
      session({ id: "idle" }),
      session({ id: "unread" }),
      session({ id: "waiting" }),
      session({ id: "failed", status: "error" }),
    ];
    const facts = {
      ...noFacts,
      attentionIds: new Set(["waiting"]),
      unreadIds: new Set(["unread"]),
    };
    const groups = groupSessionsByView(
      sessions,
      "status",
      facts,
      new Date("2026-10-08T12:00:00.000Z"),
    );
    expect(groups.map((group) => group.value)).toEqual([
      "attention",
      "error",
      "unread",
      "idle",
    ]);
  });

  it("groups agents alphabetically", () => {
    const groups = groupSessionsByView(
      [
        session({ id: "a", agentType: "codex" }),
        session({ id: "b", agentType: "claude-agent" }),
      ],
      "agent",
      noFacts,
      new Date(),
    );
    expect(groups.map((group) => group.value)).toEqual([
      "claude-agent",
      "codex",
    ]);
  });

  it("keeps every session in one flat group without grouping", () => {
    const groups = groupSessionsByView(
      [
        session({ id: "root", workspaceId: "workspace-1" }),
        session({ id: "child", parentSessionId: "root" }),
        session({ id: "other", workspaceId: "workspace-2" }),
      ],
      "none",
      noFacts,
      new Date(),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rootCount).toBe(2);
    expect(groups[0]?.sessions.map((item) => item.id)).toEqual([
      "root",
      "child",
      "other",
    ]);
  });

  it("returns no flat group when nothing matches", () => {
    expect(groupSessionsByView([], "none", noFacts, new Date())).toEqual([]);
  });
});

describe("sessionUpdatedBucket", () => {
  const now = new Date(2026, 9, 8, 12);

  it.each([
    [new Date(2026, 9, 8, 1), "today"],
    [new Date(2026, 9, 7, 23), "yesterday"],
    [new Date(2026, 9, 2, 9), "week"],
    [new Date(2026, 9, 1, 23), "older"],
  ])("puts %s in %s", (activityAt, bucket) => {
    expect(sessionUpdatedBucket(activityAt.toISOString(), now)).toBe(bucket);
  });
});

describe("splitPinnedSessions", () => {
  it("moves a pinned root together with its subtree", () => {
    const { pinned, unpinned } = splitPinnedSessions([
      session({ id: "pinned", pinnedAt: "2026-10-12T00:00:00.000Z" }),
      session({ id: "pinned-child", parentSessionId: "pinned" }),
      session({ id: "plain" }),
      session({ id: "plain-child", parentSessionId: "plain" }),
    ]);
    expect(pinned.map((item) => item.id)).toEqual(["pinned", "pinned-child"]);
    expect(unpinned.map((item) => item.id)).toEqual(["plain", "plain-child"]);
  });

  it("ignores a pin on a child whose root is not pinned", () => {
    const { pinned } = splitPinnedSessions([
      session({ id: "root" }),
      session({
        id: "child",
        parentSessionId: "root",
        pinnedAt: "2026-10-12T00:00:00.000Z",
      }),
    ]);
    expect(pinned).toEqual([]);
  });
});

describe("visibleSessionProperties", () => {
  const properties = ["timestamp", "agent", "model"] as const;

  it("shows only the timestamp in compact mode", () => {
    expect(
      visibleSessionProperties({
        ...DEFAULT_SESSION_LIST_VIEW,
        compact: true,
        properties: [...properties],
      }),
    ).toEqual(["timestamp"]);
  });

  it("restores the chosen properties when compact mode is off", () => {
    expect(
      visibleSessionProperties({
        ...DEFAULT_SESSION_LIST_VIEW,
        compact: false,
        properties: [...properties],
      }),
    ).toEqual(["timestamp", "agent", "model"]);
  });
});
