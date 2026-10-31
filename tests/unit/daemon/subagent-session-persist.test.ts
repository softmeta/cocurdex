import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

const now = "2026-08-31T00:00:00.000Z";

afterEach(async () => {
  await tempDirs.cleanup();
});

async function createService() {
  const userDataPath = await tempDirs.create("cocurdex-subagent-persist-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "subagent-persist-test",
    userDataPath,
  });
  const workspace = {
    id: "workspace-1",
    name: "Repo",
    rootPaths: ["/tmp/subagent-workspace"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  } satisfies WorkspaceRecord;
  const session = {
    id: "session-1",
    workspaceId: workspace.id,
    title: "Parent",
    agentType: "claude-agent",
    status: "running",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  } satisfies SessionRecord;
  await service.saveWorkspace(workspace);
  await service.state.saveSession(session);
  return service;
}

describe("DaemonState subagent persistence", () => {
  it("creates a child session from a subagent tool call for any adapter", async () => {
    const service = await createService();

    await service.state.persistAgentEvent({
      type: "tool.started",
      sessionId: "session-1",
      toolCall: {
        id: "task-1",
        sessionId: "session-1",
        title: "Using subagent",
        kind: "task",
        status: "in_progress",
        subagent: {
          sessionId: "claude-subagent:session-1:task-1",
          type: "reviewer",
          description: "Review changes",
        },
        content: [],
        locations: [],
        startedAt: now,
        updatedAt: now,
      },
    });

    const listed = await service.listSessions();
    expect(listed.map((session) => session.id).sort()).toEqual([
      "claude-subagent:session-1:task-1",
      "session-1",
    ]);
    expect(
      listed.find(
        (session) => session.id === "claude-subagent:session-1:task-1",
      ),
    ).toMatchObject({
      parentSessionId: "session-1",
      sessionKind: "subagent",
      title: "Review changes",
    });

    await service.shutdown();
  });

  it("does not reopen an idle child from a later in-progress spawn tool event", async () => {
    const service = await createService();
    const childId = "acp-subagent:session-1:task-1";
    const startedAt = now;
    const toolCall = {
      id: "task-1",
      sessionId: "session-1",
      title: "spawn_subagent",
      kind: "task" as const,
      status: "in_progress" as const,
      subagent: {
        sessionId: childId,
        type: "explore",
        description: "Explore Codex review",
      },
      content: [],
      locations: [],
      startedAt,
      updatedAt: startedAt,
    };

    await service.state.persistAgentEvent({
      type: "tool.started",
      sessionId: "session-1",
      toolCall,
    });
    const created = await service.state.getSession(childId);
    expect(created).toEqual(expect.objectContaining({ id: childId }));
    if (!created) {
      return;
    }
    await service.state.persistAgentEvent({
      type: "session.upserted",
      sessionId: childId,
      session: {
        ...created,
        status: "idle",
        lastMessageAt: "2026-08-31T00:02:00.000Z",
        updatedAt: "2026-08-31T00:02:00.000Z",
      },
    });
    await service.state.persistAgentEvent({
      type: "tool.updated",
      sessionId: "session-1",
      toolCall: {
        ...toolCall,
        updatedAt: "2026-08-31T00:03:00.000Z",
      },
    });

    expect(await service.state.getSession(childId)).toMatchObject({
      lastMessageAt: "2026-08-31T00:02:00.000Z",
      status: "idle",
    });

    await service.shutdown();
  });
});
