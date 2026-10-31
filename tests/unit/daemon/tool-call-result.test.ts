import { handleDaemonRequest } from "@cocurdex/daemon/internal/handler";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { DaemonRequest } from "@cocurdex/rpc";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

it("reads tool results through the named RPC and rejects invalid IDs", async () => {
  const userDataPath = tempDirs.createSync("tool-result-rpc-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "test",
    userDataPath,
  });
  const request = (toolCallId: unknown) =>
    handleDaemonRequest(service, {
      id: "request-1",
      token: "test",
      method: "session.getToolCallResult",
      params: { toolCallId },
    } as DaemonRequest<"session.getToolCallResult">);

  try {
    const database = await service.state.getDatabase();
    const timestamp = "2026-09-09T00:00:00.000Z";
    await database.workspaces.upsert({
      id: "workspace-1",
      name: "Tool result test",
      rootPaths: [userDataPath],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      sortOrder: 1000,
    });
    await database.sessions.upsert({
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Tool result test",
      agentType: "pi",
      status: "idle",
      writeMode: "read-only",
      sessionModeId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessageAt: null,
    });
    const toolCallId = `call_example|${"a".repeat(400)}+/=`;
    const result = { content: [], rawOutput: { output: "Saved result" } };
    await database.toolCalls.upsert({
      id: toolCallId,
      sessionId: "session-1",
      title: "Read result",
      status: "completed",
      ...result,
      locations: [],
      startedAt: timestamp,
      updatedAt: timestamp,
    });

    await expect(request(toolCallId)).resolves.toEqual(result);
    await expect(request("missing-tool")).resolves.toBeNull();

    const lookup = vi.spyOn(database.toolCalls, "getResultById");
    for (const id of ["", "tool\r", "tool\0", "a".repeat(4097), null, 42]) {
      await expect(request(id)).rejects.toThrow(
        /Invalid session\.getToolCallResult payload/,
      );
    }
    expect(lookup).not.toHaveBeenCalled();
  } finally {
    await service.shutdown();
  }
});

it("serves externalized results through the RPC and session snapshots", async () => {
  const userDataPath = tempDirs.createSync("tool-result-ext-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "test",
    userDataPath,
  });
  try {
    const database = await service.state.getDatabase();
    const timestamp = "2026-09-09T00:00:00.000Z";
    await database.workspaces.upsert({
      id: "workspace-1",
      name: "Tool result test",
      rootPaths: [userDataPath],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      sortOrder: 1000,
    });
    await database.sessions.upsert({
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Tool result test",
      agentType: "pi",
      status: "idle",
      writeMode: "read-only",
      sessionModeId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessageAt: null,
    });
    const result = {
      content: [{ type: "text" as const, text: "line\n".repeat(10_000) }],
      rawOutput: { exitCode: 0 },
    };
    await database.toolCalls.upsert({
      id: "tool-1",
      sessionId: "session-1",
      title: "Run tests",
      status: "completed",
      ...result,
      locations: [],
      startedAt: timestamp,
      updatedAt: timestamp,
    });

    await service.state.maintainStorage();

    expect(
      (await database.toolCalls.getResultById("tool-1"))?.resultRef,
    ).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      handleDaemonRequest(service, {
        id: "request-1",
        token: "test",
        method: "session.getToolCallResult",
        params: { toolCallId: "tool-1" },
      } as DaemonRequest<"session.getToolCallResult">),
    ).resolves.toEqual(result);
    const snapshot = await service.getSessionSnapshot("session-1");
    expect(snapshot?.toolCalls).toEqual([
      expect.objectContaining({ id: "tool-1", ...result }),
    ]);
  } finally {
    await service.shutdown();
  }
});
