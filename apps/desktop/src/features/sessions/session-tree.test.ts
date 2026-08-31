import type { SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  buildVisibleSessionTree,
  collectSessionSubtreeIds,
  isSubagentSession,
} from "./session-tree";

function session(
  partial: Pick<SessionRecord, "id"> & Partial<SessionRecord>,
): SessionRecord {
  return {
    agentType: "grok-build",
    collaborationMode: "default",
    createdAt: "2026-08-31T00:00:00.000Z",
    lastMessageAt: null,
    parentSessionId: null,
    sessionKind: partial.parentSessionId ? "subagent" : "main",
    status: "idle",
    title: partial.title ?? partial.id,
    updatedAt:
      partial.updatedAt ?? partial.createdAt ?? "2026-08-31T00:00:00.000Z",
    workspaceId: "workspace-1",
    writeMode: "native-write",
    ...partial,
  };
}

describe("buildVisibleSessionTree", () => {
  it("nests subagent sessions under their parent in spawn order", () => {
    const parent = session({
      id: "parent",
      lastMessageAt: "2026-08-31T01:00:00.000Z",
      title: "Review changes",
    });
    const firstChild = session({
      createdAt: "2026-08-31T01:01:00.000Z",
      id: "child-a",
      parentSessionId: "parent",
      title: "Standards review",
    });
    const secondChild = session({
      createdAt: "2026-08-31T01:02:00.000Z",
      id: "child-b",
      parentSessionId: "parent",
      title: "Correctness review",
    });
    const other = session({
      id: "other",
      lastMessageAt: "2026-08-31T00:30:00.000Z",
      title: "Other",
    });

    const nodes = buildVisibleSessionTree([
      secondChild,
      other,
      firstChild,
      parent,
    ]);

    expect(nodes.map((node) => node.session.id)).toEqual([
      "parent",
      "child-a",
      "child-b",
      "other",
    ]);
    expect(nodes.map((node) => node.depth)).toEqual([0, 1, 1, 0]);
    expect(nodes[0]?.hasChildren).toBe(true);
  });

  it("bubbles a parent above older roots when a child is newer", () => {
    const parent = session({
      id: "parent",
      lastMessageAt: "2026-08-31T00:10:00.000Z",
    });
    const child = session({
      createdAt: "2026-08-31T02:00:00.000Z",
      id: "child",
      lastMessageAt: "2026-08-31T02:00:00.000Z",
      parentSessionId: "parent",
    });
    const recentRoot = session({
      id: "recent-root",
      lastMessageAt: "2026-08-31T01:00:00.000Z",
    });

    const nodes = buildVisibleSessionTree([recentRoot, child, parent]);

    expect(nodes.map((node) => node.session.id)).toEqual([
      "parent",
      "child",
      "recent-root",
    ]);
  });

  it("keeps nested grandchildren under their parent", () => {
    const root = session({ id: "root" });
    const child = session({
      createdAt: "2026-08-31T00:01:00.000Z",
      id: "child",
      parentSessionId: "root",
    });
    const grandchild = session({
      createdAt: "2026-08-31T00:02:00.000Z",
      id: "grandchild",
      parentSessionId: "child",
    });

    const nodes = buildVisibleSessionTree([grandchild, child, root]);

    expect(nodes.map((node) => node.session.id)).toEqual([
      "root",
      "child",
      "grandchild",
    ]);
    expect(nodes.map((node) => node.depth)).toEqual([0, 1, 2]);
  });

  it("surfaces orphans whose parent is missing at depth 0", () => {
    const orphan = session({
      id: "orphan",
      parentSessionId: "missing",
      title: "Orphan",
    });

    expect(buildVisibleSessionTree([orphan])).toEqual([
      {
        depth: 0,
        hasChildren: false,
        session: orphan,
      },
    ]);
  });
});

describe("collectSessionSubtreeIds", () => {
  it("includes the root and every descendant", () => {
    const sessions = [
      session({ id: "root" }),
      session({ id: "child", parentSessionId: "root" }),
      session({ id: "grandchild", parentSessionId: "child" }),
      session({ id: "other" }),
    ];

    expect([...collectSessionSubtreeIds(sessions, "root")].sort()).toEqual([
      "child",
      "grandchild",
      "root",
    ]);
  });
});

describe("isSubagentSession", () => {
  it("treats sessionKind or parentSessionId as a subagent session", () => {
    expect(
      isSubagentSession({ parentSessionId: null, sessionKind: "subagent" }),
    ).toBe(true);
    expect(
      isSubagentSession({ parentSessionId: "parent", sessionKind: "main" }),
    ).toBe(true);
    expect(
      isSubagentSession({ parentSessionId: null, sessionKind: "main" }),
    ).toBe(false);
  });
});
