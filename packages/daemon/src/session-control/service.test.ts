import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgentRegistry } from "@cocurdex/agent-core";
import type { MessageRecord, SendSessionCommand } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CocurdexDaemonService } from "../service";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "cocurdex-task-control-"));
  const service = new CocurdexDaemonService({
    userDataPath: root,
    runtimeFingerprint: "test",
  });
  cleanup.push(async () => {
    await service.shutdown();
    await rm(root, { force: true, recursive: true });
  });
  const pi = createAgentRegistry()
    .list()
    .find((agent) => agent.id === "pi");
  if (!pi) throw new Error("Missing Pi descriptor");
  vi.spyOn(service, "listAgents").mockResolvedValue([
    { ...pi, availability: "available" },
  ]);
  const now = new Date().toISOString();
  await service.saveWorkspace({
    id: "workspace-1",
    name: "Workspace",
    rootPaths: [root],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1,
  });
  await service.saveSessionConfiguration({
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Task",
    agentType: "pi",
    writeMode: "read-only",
    sessionModeId: null,
  });
  return { service, root };
}

describe("authoritative task commands", () => {
  it("keeps storage open until accepted background preparation is drained during shutdown", async () => {
    const { service } = await fixture();
    let release!: () => void;
    vi.spyOn(service.state, "listMessagesBySessionId").mockReturnValueOnce(
      new Promise<MessageRecord[]>((resolve) => {
        release = () => resolve([]);
      }),
    );
    const runtimeStopped = vi
      .spyOn(service.runtime, "shutdown")
      .mockResolvedValue();
    const dispatch = vi.spyOn(service.runtime, "sendSessionMessage");
    await service.sendSessionMessage({
      sessionId: "session-1",
      content: "Run",
    });
    let closed = false;
    const stopping = service.shutdown().then(() => {
      closed = true;
    });
    try {
      await vi.waitFor(() => expect(runtimeStopped).toHaveBeenCalledOnce());
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closed).toBe(false);
      expect(await service.state.getSession("session-1")).not.toBeNull();
    } finally {
      release();
      await stopping;
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("builds runtime context from daemon state and rejects legacy client records", async () => {
    const { service, root } = await fixture();
    const dispatch = vi
      .spyOn(service.runtime, "sendSessionMessage")
      .mockImplementation(async (payload) => ({
        id: payload.messageId ?? "message-1",
        sessionId: payload.session.id,
        role: "user",
        content: payload.content,
        attachments: [],
        createdAt: new Date().toISOString(),
      }));
    await expect(
      service.sendSessionMessage({
        sessionId: "session-1",
        content: "Run",
        workspaceRootPath: "/untrusted",
      } as SendSessionCommand),
    ).rejects.toThrow("Unexpected field");
    expect(await service.state.listMessagesBySessionId("session-1")).toEqual(
      [],
    );

    await service.sendSessionMessage({
      sessionId: "session-1",
      content: "Run",
    });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      workspaceRootPath: root,
      session: { id: "session-1", writeMode: "read-only" },
    });
  });

  it("rejects unknown and archived sessions without creating messages", async () => {
    const { service } = await fixture();
    await expect(
      service.sendSessionMessage({ sessionId: "unknown", content: "Run" }),
    ).rejects.toThrow("not found");
    const session = await service.getSession("session-1");
    if (!session) throw new Error("Missing session");
    await service.state.saveSession({
      ...session,
      archivedAt: new Date().toISOString(),
    });
    await expect(
      service.sendSessionMessage({ sessionId: session.id, content: "Run" }),
    ).rejects.toThrow("Restore the session");
    expect(await service.state.listMessagesBySessionId(session.id)).toEqual([]);
  });

  it("accepts only one simultaneous new turn from two clients", async () => {
    const { service } = await fixture();
    let release!: () => void;
    vi.spyOn(service.runtime, "sendSessionMessage").mockReturnValue(
      new Promise<MessageRecord>((resolve) => {
        release = () =>
          resolve({
            id: "result",
            sessionId: "session-1",
            role: "user",
            content: "Run",
            attachments: [],
            createdAt: new Date().toISOString(),
          });
      }),
    );
    try {
      const results = await Promise.allSettled([
        service.sendSessionMessage({
          sessionId: "session-1",
          content: "First",
        }),
        service.sendSessionMessage({
          sessionId: "session-1",
          content: "Second",
        }),
      ]);
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "rejected",
      ]);
      expect(await service.state.listMessagesBySessionId("session-1")).toEqual([
        expect.objectContaining({ content: "First" }),
      ]);
    } finally {
      release();
    }
  });

  it("checks message ownership before stopping or rewinding a session", async () => {
    const { service } = await fixture();
    await service.saveSessionConfiguration({
      id: "session-2",
      workspaceId: "workspace-1",
      title: "Other",
      agentType: "pi",
      writeMode: "read-only",
      sessionModeId: null,
    });
    const existing: MessageRecord = {
      id: "message-1",
      sessionId: "session-2",
      role: "user",
      content: "Other task",
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    await service.state.saveUserMessage(existing);
    const stop = vi.spyOn(service.runtime, "cancelSessionTurn");
    await expect(
      service.sendSessionMessage({
        sessionId: "session-1",
        messageId: existing.id,
        content: "Replace",
      }),
    ).rejects.toThrow("Message ID already exists");
    await expect(
      service.submitPreviousMessage({
        sessionId: "session-1",
        messageId: existing.id,
        content: "Replace",
        revertWorkspace: false,
      }),
    ).rejects.toThrow("Previous user message not found");
    expect(stop).not.toHaveBeenCalled();
    expect(await service.state.getMessageById(existing.id)).toEqual(existing);
  });

  it("resubmits with the stored message identity and timestamp", async () => {
    const { service } = await fixture();
    const existing: MessageRecord = {
      id: "message-1",
      sessionId: "session-1",
      role: "user",
      content: "Original",
      attachments: [],
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    await service.state.saveUserMessage(existing);
    vi.spyOn(service.runtime, "sendSessionMessage").mockResolvedValue(existing);
    const result = await service.submitPreviousMessage({
      sessionId: existing.sessionId,
      messageId: existing.id,
      content: " Revised ",
      revertWorkspace: false,
    });
    expect(result).toEqual({ ...existing, content: "Revised" });
  });
});
