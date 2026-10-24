import {
  buildSessionSections,
  sessionRowStatus,
} from "@cocurdex/mobile/internal/sessions/session-sections";
import type {
  SessionAttentionSnapshot,
  SessionPrimaryState,
  SessionRecord,
  WorkspaceRecord,
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

function attention(
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

describe("buildSessionSections", () => {
  it("groups by workspace, newest activity first in rows and sections", () => {
    const sections = buildSessionSections({
      workspaces: WORKSPACES,
      sessions: [
        session("a", "shop", "2026-10-20T10:00:00.000Z"),
        session("b", "docs", "2026-10-22T10:00:00.000Z"),
        session("c", "shop", "2026-10-23T10:00:00.000Z"),
        session("d", "docs", null),
      ],
      attention: [],
      query: "",
    });

    expect(
      sections.map((section) => [
        section.title,
        section.rows.map((row) => row.id),
      ]),
    ).toEqual([
      ["acme-shop", ["c", "a"]],
      ["docs", ["b", "d"]],
    ]);
    expect(sections[1]?.rows[1]?.activityAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("lists only the person's top-level, unarchived agent sessions", () => {
    const sections = buildSessionSections({
      workspaces: WORKSPACES,
      sessions: [
        session("main", "shop", "2026-10-20T10:00:00.000Z"),
        session("child", "shop", "2026-10-21T10:00:00.000Z", {
          parentSessionId: "main",
          sessionKind: "subagent",
        }),
        session("chat", "shop", "2026-10-21T10:00:00.000Z", {
          sessionKind: "chat",
        }),
        session("old", "shop", "2026-10-21T10:00:00.000Z", {
          archivedAt: "2026-10-22T00:00:00.000Z",
        }),
        session("orphan", "gone", "2026-10-21T10:00:00.000Z"),
      ],
      attention: [],
      query: "",
    });

    expect(
      sections.flatMap((section) => section.rows.map((r) => r.id)),
    ).toEqual(["main"]);
  });

  it("matches the query against titles and workspace names, ignoring case", () => {
    const input = {
      workspaces: WORKSPACES,
      sessions: [
        session("a", "shop", "2026-10-20T10:00:00.000Z", {
          title: "Fix Checkout rounding",
        }),
        session("b", "docs", "2026-10-21T10:00:00.000Z", {
          title: "Release notes",
        }),
      ],
      attention: [],
    };

    const byTitle = buildSessionSections({ ...input, query: " checkout " });
    const byWorkspace = buildSessionSections({ ...input, query: "DOCS" });

    expect(byTitle.flatMap((s) => s.rows.map((r) => r.id))).toEqual(["a"]);
    expect(byWorkspace.flatMap((s) => s.rows.map((r) => r.id))).toEqual(["b"]);
  });

  it("carries each session's attention state, defaulting to ready", () => {
    const sections = buildSessionSections({
      workspaces: WORKSPACES,
      sessions: [
        session("a", "shop", "2026-10-20T10:00:00.000Z"),
        session("b", "shop", "2026-10-19T10:00:00.000Z"),
      ],
      attention: [attention("a", "pending-approval")],
      query: "",
    });

    expect(sections[0]?.rows.map((row) => row.state)).toEqual([
      "pending-approval",
      "ready",
    ]);
  });

  it("raises a subagent's more urgent state onto its top-level session", () => {
    const sections = buildSessionSections({
      workspaces: WORKSPACES,
      sessions: [
        session("main", "shop", "2026-10-20T10:00:00.000Z"),
        session("child", "shop", null, { parentSessionId: "main" }),
        session("grandchild", "shop", null, { parentSessionId: "child" }),
      ],
      attention: [
        attention("main", "working"),
        attention("child", "completed-unread"),
        attention("grandchild", "awaiting-input"),
      ],
      query: "",
    });

    expect(sections[0]?.rows[0]?.state).toBe("awaiting-input");
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
