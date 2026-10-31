import { loadExecutionTree } from "@cocurdex/daemon/internal/execution-tree/load-execution-tree";
import type { SessionRecord } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

function session(id: string, parentSessionId: string | null = null) {
  return {
    id,
    workspaceId: "ws",
    title: id,
    agentType: "codex",
    parentSessionId,
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastMessageAt: null,
  } as SessionRecord;
}

function deps(sessions: SessionRecord[]) {
  return {
    listSessions: async () => sessions,
    listRuns: vi.fn((_sessionId: string) => []),
    listToolCalls: vi.fn(async (_sessionId: string) => []),
    getInteractions: () => ({
      permissions: [],
      questions: [],
      planApprovals: [],
    }),
    getPlan: () => null,
  };
}

describe("loadExecutionTree", () => {
  it("returns null when the root session does not exist", async () => {
    expect(await loadExecutionTree(deps([]), "missing")).toBeNull();
  });

  it("reads only the root's descendants within the depth limit", async () => {
    const source = deps([
      session("a"),
      session("b", "a"),
      session("c", "b"),
      session("d", "c"),
      session("other"),
    ]);

    const tree = await loadExecutionTree(source, "a", 2);

    const loaded = source.listToolCalls.mock.calls.map(([id]) => id);
    expect(loaded.sort()).toEqual(["a", "b", "c"]);
    expect(tree?.root.children[0]?.children[0]?.truncated).toBe(true);
  });
});
