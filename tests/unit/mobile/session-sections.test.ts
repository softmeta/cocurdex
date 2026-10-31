import {
  buildSessionSections,
  sessionRowStatus,
} from "@cocurdex/mobile/internal/sessions/session-sections";
import {
  normalizeSessionListView,
  type SessionAttentionSnapshot,
  type SessionListView,
  type SessionPrimaryState,
  type SessionRecord,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function workspace(id: string, name: string): WorkspaceRecord {
  return {
    id,
    name,
    rootPaths: [`/synthetic/${id}`],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastOpenedAt: "2026-10-01T00:00:00.000Z",
    sortOrder: 0,
  };
}

function session(
  id: string,
  workspaceId: string,
  lastMessageAt: string | null,
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    workspaceId,
    title: `Session ${id}`,
    agentType: "claude-agent",
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    lastMessageAt,
    ...extra,
  };
}

function snapshot(
  sessionId: string,
  primaryState: SessionPrimaryState,
): SessionAttentionSnapshot {
  return {
    sessionId,
    primaryState,
    runtimeState: "ready",
    attentionState: "none",
    activityKind: null,
    connectionPending: false,
    latestResultAt: null,
    lastVisitedAt: null,
    resultDisposition: "automatic",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
}

const WORKSPACES = [workspace("shop", "acme-shop"), workspace("docs", "docs")];

function sections(
  sessions: SessionRecord[],
  options: {
    attention?: SessionAttentionSnapshot[];
    query?: string;
    view?: Partial<SessionListView>;
    collapsedIds?: string[];
    expandedSectionKeys?: string[];
  } = {},
) {
  return buildSessionSections({
    workspaces: WORKSPACES,
    sessions,
    attention: options.attention ?? [],
    query: options.query ?? "",
    view: normalizeSessionListView({ ...options.view }),
    collapsedIds: new Set(options.collapsedIds),
    expandedSectionKeys: new Set(options.expandedSectionKeys),
    now: new Date("2026-10-24T12:00:00.000Z"),
  });
}

function ids(result: ReturnType<typeof sections>) {
  return result.map((section) => [
    section.key,
    section.rows.map((row) => row.id),
  ]);
}

describe("buildSessionSections", () => {
  it("groups by workspace, newest activity first in rows and sections", () => {
    const result = sections([
      session("a", "shop", "2026-10-20T10:00:00.000Z"),
      session("b", "docs", "2026-10-22T10:00:00.000Z"),
      session("c", "shop", "2026-10-23T10:00:00.000Z"),
      session("d", "docs", null),
    ]);

    expect(result.map((section) => section.heading)).toEqual([
      { kind: "workspace", name: "acme-shop" },
      { kind: "workspace", name: "docs" },
    ]);
    expect(ids(result)).toEqual([
      ["workspace:shop", ["c", "a"]],
      ["workspace:docs", ["b", "d"]],
    ]);
    expect(result[1]?.rows[1]?.activityAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("leaves out chat, archived, and orphaned sessions", () => {
    const result = sections([
      session("main", "shop", "2026-10-20T10:00:00.000Z"),
      session("chat", "shop", "2026-10-21T10:00:00.000Z", {
        sessionKind: "chat",
      }),
      session("old", "shop", "2026-10-21T10:00:00.000Z", {
        archivedAt: "2026-10-22T00:00:00.000Z",
      }),
      session("orphan", "gone", "2026-10-21T10:00:00.000Z"),
    ]);

    expect(ids(result)).toEqual([["workspace:shop", ["main"]]]);
  });

  it("shows child sessions under their parent with depth and count", () => {
    const result = sections([
      session("main", "shop", "2026-10-20T10:00:00.000Z"),
      session("child", "shop", "2026-10-21T10:00:00.000Z", {
        parentSessionId: "main",
        sessionKind: "subagent",
      }),
      session("sibling", "shop", "2026-10-21T09:00:00.000Z", {
        parentSessionId: "main",
        sessionKind: "subagent",
      }),
    ]);

    expect(
      result[0]?.rows.map((row) => [
        row.id,
        row.depth,
        row.hasChildren,
        row.childCount,
      ]),
    ).toEqual([
      ["main", 0, true, 2],
      ["child", 1, false, 0],
      ["sibling", 1, false, 0],
    ]);
  });

  it("matches the query against whole trees, titles and workspace names", () => {
    const tree = [
      session("a", "shop", "2026-10-20T10:00:00.000Z", {
        title: "Fix Checkout rounding",
      }),
      session("a1", "shop", null, {
        parentSessionId: "a",
        title: "Explore tax tables",
      }),
      session("b", "docs", "2026-10-21T10:00:00.000Z", {
        title: "Release notes",
      }),
    ];

    expect(ids(sections(tree, { query: " TAX " }))).toEqual([
      ["workspace:shop", ["a", "a1"]],
    ]);
    expect(ids(sections(tree, { query: "DOCS" }))).toEqual([
      ["workspace:docs", ["b"]],
    ]);
  });

  it("rolls a subtree's most urgent state onto a collapsed parent only", () => {
    const tree = [
      session("main", "shop", "2026-10-20T10:00:00.000Z"),
      session("child", "shop", null, { parentSessionId: "main" }),
      session("grandchild", "shop", null, { parentSessionId: "child" }),
    ];
    const attention = [
      snapshot("main", "working"),
      snapshot("child", "completed-unread"),
      snapshot("grandchild", "awaiting-input"),
    ];

    const expanded = sections(tree, { attention });
    const collapsed = sections(tree, { attention, collapsedIds: ["main"] });

    expect(expanded[0]?.rows.map((row) => row.state)).toEqual([
      "working",
      "completed-unread",
      "awaiting-input",
    ]);
    expect(collapsed[0]?.rows.map((row) => [row.id, row.state])).toEqual([
      ["main", "awaiting-input"],
    ]);
  });

  it("puts pinned sessions first in their own unlimited section", () => {
    const result = sections(
      [
        session("a", "shop", "2026-10-20T10:00:00.000Z"),
        session("b", "docs", "2026-10-21T10:00:00.000Z", {
          pinnedAt: "2026-10-22T00:00:00.000Z",
        }),
      ],
      { view: { grouping: "status" } },
    );

    expect(result[0]?.heading).toEqual({ kind: "pinned" });
    expect(result[0]?.rows.map((row) => [row.id, row.pinned])).toEqual([
      ["b", true],
    ]);
    expect(result.slice(1).flatMap((s) => s.rows.map((r) => r.id))).toEqual([
      "a",
    ]);
  });

  it("limits roots per section, keeps running ones, and expands on request", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      session(`s${index}`, "shop", `2026-10-2${index % 10}T10:00:00.000Z`),
    );
    const attention = [snapshot("s0", "working")];

    const limited = sections(many, { attention });
    const expanded = sections(many, {
      attention,
      expandedSectionKeys: ["workspace:shop"],
    });

    expect(limited[0]?.rows.map((row) => row.id)).toContain("s0");
    expect(limited[0]?.rows).toHaveLength(9);
    expect(limited[0]?.hiddenCount).toBe(1);
    expect(expanded[0]?.rows).toHaveLength(10);
    expect(expanded[0]?.hiddenCount).toBe(0);
  });

  it("filters by status and groups by status", () => {
    const result = sections(
      [
        session("a", "shop", "2026-10-20T10:00:00.000Z"),
        session("b", "docs", "2026-10-21T10:00:00.000Z"),
      ],
      {
        attention: [snapshot("a", "pending-approval")],
        view: { grouping: "status", statuses: ["attention"] },
      },
    );

    expect(result.map((section) => section.heading)).toEqual([
      { kind: "status", value: "attention" },
    ]);
    expect(ids(result)[0]?.[1]).toEqual(["a"]);
  });
});

describe("sessionRowStatus", () => {
  it("maps every primary state to one trailing mark", () => {
    const states: SessionPrimaryState[] = [
      "pending-approval",
      "awaiting-input",
      "plan-ready",
      "failed",
      "working",
      "connecting",
      "completed-unread",
      "monitoring",
      "ready",
    ];

    expect(states.map(sessionRowStatus)).toEqual([
      "needs-you",
      "needs-you",
      "needs-you",
      "failed",
      "running",
      "running",
      "unread",
      "running",
      "none",
    ]);
  });
});
