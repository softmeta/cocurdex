import { archivedSessionRows } from "@cocurdex/mobile/internal/sessions/archived-sessions";
import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function session(
  id: string,
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    workspaceId: "w1",
    title: id,
    agentType: "codex",
    status: "idle",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  } as SessionRecord;
}

const workspaces = [{ id: "w1", name: "acme-shop" }] as WorkspaceRecord[];

describe("archivedSessionRows", () => {
  it("lists archived top-level sessions, newest archive first", () => {
    const rows = archivedSessionRows(
      [
        session("live"),
        session("old", { archivedAt: "2026-10-02T00:00:00.000Z" }),
        session("new", { archivedAt: "2026-10-20T00:00:00.000Z" }),
        session("child", {
          archivedAt: "2026-10-21T00:00:00.000Z",
          parentSessionId: "new",
        }),
        session("chat", {
          archivedAt: "2026-10-22T00:00:00.000Z",
          sessionKind: "chat",
        }),
      ],
      workspaces,
    );
    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
    expect(rows[0]).toMatchObject({ workspaceName: "acme-shop" });
  });
});
