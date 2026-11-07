import type { SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  cycleSearchCategory,
  rankSessions,
  searchCategories,
  sessionsInScope,
} from "@/app/layout/search-palette/search-palette-model";

function session(
  partial: Pick<SessionRecord, "id" | "title"> & Partial<SessionRecord>,
): SessionRecord {
  return {
    agentType: "acp:grok-build",
    sessionModeId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    lastMessageAt: null,
    parentSessionId: null,
    sessionKind: "main",
    status: "idle",
    updatedAt: "2026-09-01T00:00:00.000Z",
    workspaceId: "workspace-1",
    writeMode: "native-write",
    ...partial,
  };
}

const ids = (sessions: SessionRecord[]) => sessions.map(({ id }) => id);

describe("rankSessions", () => {
  const sessions = [
    session({
      id: "old-prefix",
      lastMessageAt: "2026-09-01T01:00:00.000Z",
      title: "Fix sidebar",
    }),
    session({
      id: "new-contains",
      lastMessageAt: "2026-09-03T00:00:00.000Z",
      title: "Polish the sidebar list",
    }),
    session({
      id: "new-prefix",
      lastMessageAt: "2026-09-02T00:00:00.000Z",
      title: "fix search",
    }),
    session({
      id: "subagent",
      lastMessageAt: "2026-09-04T00:00:00.000Z",
      parentSessionId: "new-prefix",
      sessionKind: "subagent",
      title: "Fix subtask",
    }),
  ];

  it("lists main sessions by recent activity for an empty query", () => {
    expect(ids(rankSessions(sessions, "  ", 2))).toEqual([
      "new-contains",
      "new-prefix",
    ]);
  });

  it("ranks title prefix matches before other matches, ignoring case", () => {
    expect(ids(rankSessions(sessions, "FIX", 10))).toEqual([
      "new-prefix",
      "old-prefix",
    ]);
    expect(ids(rankSessions(sessions, "sidebar", 10))).toEqual([
      "new-contains",
      "old-prefix",
    ]);
  });
});

describe("cycleSearchCategory", () => {
  it("wraps around in both directions", () => {
    const categories = searchCategories("everything");
    expect(cycleSearchCategory(categories, "all", -1)).toBe("issues");
    expect(cycleSearchCategory(categories, "issues", 1)).toBe("all");
    expect(cycleSearchCategory(categories, "sessions", 1)).toBe("files");
  });
});

describe("assistant search scope", () => {
  it("keeps workspace files and other modes' sessions out of assistant search", () => {
    const categories = searchCategories("assistants");
    expect(categories).not.toContain("files");
    expect(cycleSearchCategory(categories, "sessions", 1)).toBe("notes");
    const mixed = [
      session({ id: "work", title: "Work" }),
      session({ id: "chat", sessionKind: "chat", title: "Chat" }),
      session({ id: "assistant", sessionKind: "personal", title: "Assistant" }),
    ];
    expect(ids(sessionsInScope(mixed, "assistants"))).toEqual(["assistant"]);
    expect(ids(sessionsInScope(mixed, "everything"))).toEqual([
      "work",
      "chat",
      "assistant",
    ]);
  });
});
