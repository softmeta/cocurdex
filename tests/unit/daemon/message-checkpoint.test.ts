import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { AgentMessageDeltaEvent } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

const now = "2026-10-14T00:00:00.000Z";

async function createService() {
  const userDataPath = tempDirs.createSync("checkpoint-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "checkpoint-test",
    userDataPath,
  });
  await service.saveWorkspace({
    id: "workspace-1",
    name: "acme-shop",
    rootPaths: [userDataPath],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  });
  await service.state.saveSession({
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Streaming",
    agentType: "pi",
    status: "running",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  });
  return { service, userDataPath };
}

function delta(text: string): AgentMessageDeltaEvent {
  return {
    type: "message.delta",
    sessionId: "session-1",
    messageId: "assistant-1",
    role: "assistant",
    kind: "response",
    delta: text,
    createdAt: now,
  };
}

describe("streaming message checkpoints", () => {
  it("persists a long in-progress reply and keeps it out of the settled list", async () => {
    const { service, userDataPath } = await createService();
    const chunk = "x".repeat(16 * 1024);
    await service.state.persistAgentEvent(delta("Thinking. "));
    await service.state.persistAgentEvent(delta(chunk));
    await service.state.persistAgentEvent(delta(" tail"));

    const database = await service.state.getDatabase();
    expect((await database.messages.getById("assistant-1"))?.content).toBe(
      `Thinking. ${chunk}`,
    );
    const snapshot = await service.getSessionSnapshot("session-1");
    expect(snapshot?.messages).toEqual([]);
    expect(snapshot?.activeMessages).toEqual([
      expect.objectContaining({
        id: "assistant-1",
        content: `Thinking. ${chunk} tail`,
      }),
    ]);
    await service.shutdown();

    const restarted = new CocurdexDaemonService({
      runtimeFingerprint: "checkpoint-test",
      userDataPath,
    });
    const afterRestart = await restarted.getSessionSnapshot("session-1");
    expect(afterRestart?.messages.map((message) => message.id)).toContain(
      "assistant-1",
    );
    expect(
      afterRestart?.messages.find((message) => message.id === "assistant-1")
        ?.content,
    ).toBe(`Thinking. ${chunk} tail`);
    await restarted.shutdown();
  });
});
