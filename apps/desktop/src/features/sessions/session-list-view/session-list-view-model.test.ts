import type { SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_LIST_VIEW,
  filterSessionsByView,
  groupSessionsByView,
  normalizeSessionListView,
  type SessionListFacts,
  sessionUpdatedBucket,
} from "./session-list-view-model";

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
