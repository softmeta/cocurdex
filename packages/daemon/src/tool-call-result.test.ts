import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DaemonRequest } from "@cocurdex/rpc";
import { expect, it, vi } from "vitest";
import { handleDaemonRequest } from "./handler";
import { CocurdexDaemonService } from "./service";

it("reads tool results through the named RPC and rejects invalid IDs", async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), "tool-result-rpc-"));
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
    const database = await service.state.getChatDatabase();
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
      collaborationMode: "default",
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
    for (const id of ["", "tool\n", "tool\0", "a".repeat(4097), null, 42]) {
      await expect(request(id)).rejects.toThrow("Invalid tool call ID");
    }
    expect(lookup).not.toHaveBeenCalled();

    await expect(
      service.state.callStorage("toolCall.getResult", [toolCallId]),
    ).rejects.toThrow("Unsupported storage operation: toolCall.getResult");
  } finally {
    await service.shutdown();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
