import type { SessionRecord } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import { resolveSessionMetaItems } from "@/app/layout/sidebar/session-sidebar-meta-items";

vi.mock("@/features/sessions", () => ({
  getAgentDisplayLabel: (agentId: string) => `label:${agentId}`,
}));

const session: SessionRecord = {
  id: "session-1",
  agentType: "codex",
  sessionModeId: null,
  createdAt: "2026-10-08T08:00:00.000Z",
  lastMessageAt: null,
  parentSessionId: null,
  status: "idle",
  title: "Session",
  updatedAt: "2026-10-08T08:00:00.000Z",
  workspaceId: "workspace-1",
  writeMode: "native-write",
};

describe("resolveSessionMetaItems", () => {
  it("leaves the timestamp to the title line", () => {
    expect(resolveSessionMetaItems(["timestamp"], { session })).toEqual([]);
  });

  it("skips properties the session has no value for", () => {
    expect(
      resolveSessionMetaItems(["agent", "model", "role", "worktree"], {
        session,
      }).map((item) => item.label),
    ).toEqual(["label:codex"]);
  });

  it("names a worktree by its folder on POSIX and Windows paths", () => {
    const labels = ["/repo/.worktrees/fix-login/", "C:\\repo\\wt\\feat-x"].map(
      (worktreePath) =>
        resolveSessionMetaItems(["worktree"], {
          session: { ...session, worktreePath },
        })[0]?.label,
    );
    expect(labels).toEqual(["fix-login", "feat-x"]);
  });
});
