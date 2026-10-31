import { createAgentRegistry } from "@cocurdex/agent-core";
import { requestDaemon } from "@cocurdex/daemon/internal/client";
import { ProviderCredentials } from "@cocurdex/daemon/internal/provider-credentials/service";
import { AgentRuntimeManager } from "@cocurdex/daemon/internal/runtime";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import { startDaemonServer } from "@cocurdex/daemon/internal/wire";
import type { MessageRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();
const daemons: Awaited<ReturnType<typeof startDaemonServer>>[] = [];

function resumeQueued(root: string) {
  return requestDaemon(
    "session.resumeQueued",
    { sessionId: "session" },
    { userDataPath: root },
  );
}
const dispatchWait = { timeout: 15_000 };
const timestamp = "2026-09-13T00:00:00.000Z";
const message: MessageRecord = {
  id: "message",
  sessionId: "session",
  role: "user",
  content: "Queued work",
  attachments: [],
  createdAt: timestamp,
};

beforeEach(() => {
  const pi = createAgentRegistry()
    .list()
    .find((agent) => agent.id === "pi");
  if (!pi) throw new Error("Missing Pi descriptor");
  vi.spyOn(CocurdexDaemonService.prototype, "listAgents").mockResolvedValue([
    { ...pi, availability: "available" },
  ]);
});

afterEach(async () => {
  for (const daemon of daemons.splice(0)) await daemon.close();
  await tempDirs.cleanup();
  vi.restoreAllMocks();
});

async function start(root: string) {
  const daemon = await startDaemonServer({
    userDataPath: root,
    runtimeFingerprint: "test",
    token: "test-token",
  });
  daemons.push(daemon);
  return daemon;
}

async function seed(archived = false) {
  const root = await tempDirs.create("cdq-");
  const first = await start(root);
  await vi.waitFor(() =>
    expect(first.service.getActiveWork().agentTurns).toBe(0),
  );
  await first.service.state.saveWorkspace({
    id: "workspace",
    name: "Recovery",
    rootPaths: [root],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    sortOrder: 1,
  });
  await first.service.state.saveSession({
    id: "session",
    workspaceId: "workspace",
    title: "Task",
    agentType: "pi",
    writeMode: "read-only",
    sessionModeId: null,
    status: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: null,
    archivedAt: archived ? timestamp : null,
  });
  await first.service.state.saveQueuedUserMessage(message, {
    sessionId: message.sessionId,
    messageId: message.id,
    workspaceRootPath: "/stale-client-path",
    createdAt: timestamp,
  });
  await first.close();
  return root;
}

describe("daemon-owned queue recovery", () => {
  it("keeps persisted inputs paused when the daemon starts", async () => {
    const root = await seed();
    const dispatch = vi
      .spyOn(AgentRuntimeManager.prototype, "sendSessionMessage")
      .mockResolvedValue(message);
    const second = await start(root);
    await requestDaemon("app.bootstrap", { userDataPath: root });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dispatch).not.toHaveBeenCalled();
    expect(await second.service.state.listQueuedAgentInputs("session")).toEqual(
      [expect.objectContaining({ messageId: message.id })],
    );
    expect((await second.service.bootstrap()).pausedQueueSessionIds).toEqual([
      "session",
    ]);
  });

  it("reports the queue as no longer paused once it is resumed", async () => {
    const root = await seed();
    vi.spyOn(ProviderCredentials.prototype, "forSession").mockResolvedValue(
      null,
    );
    vi.spyOn(
      AgentRuntimeManager.prototype,
      "sendSessionMessage",
    ).mockReturnValue(new Promise(() => undefined));
    const second = await start(root);
    const before = await second.service.pullSync({ sessionIds: [] });
    expect(before.pausedQueueSessionIds).toEqual(["session"]);

    await expect(resumeQueued(root)).resolves.toBe(true);

    const after = await second.service.pullSync({ sessionIds: [] });
    expect(after.pausedQueueSessionIds).toEqual([]);
  });

  it("does not start a resumed task when shutdown arrives during credential resolution", async () => {
    const root = await seed();
    let release!: () => void;
    const credentials = vi
      .spyOn(ProviderCredentials.prototype, "forSession")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(null);
          }),
      )
      .mockResolvedValue(null);
    const dispatch = vi
      .spyOn(AgentRuntimeManager.prototype, "sendSessionMessage")
      .mockResolvedValue(message);
    const second = await start(root);
    void resumeQueued(root).catch(() => undefined);
    await vi.waitFor(() => expect(credentials).toHaveBeenCalledOnce());
    const closing = second.close();
    await new Promise<void>((resolve) => setImmediate(resolve));
    release();
    await closing;
    expect(dispatch).not.toHaveBeenCalled();
    await start(root);
    await resumeQueued(root);
    await vi.waitFor(
      () => expect(dispatch).toHaveBeenCalledOnce(),
      dispatchWait,
    );
  });

  it("resumes persisted inputs with current host credentials and paths", async () => {
    const root = await seed();
    const credentials = vi
      .spyOn(ProviderCredentials.prototype, "forSession")
      .mockResolvedValue({
        providerId: "provider",
        providerName: "Provider",
        api: "openai-completions",
        baseUrl: "https://example.invalid",
        modelId: "model",
        modelName: "Model",
        apiKey: "host-owned-key",
      });
    const dispatch = vi
      .spyOn(AgentRuntimeManager.prototype, "sendSessionMessage")
      .mockResolvedValue(message);
    const second = await start(root);
    await expect(resumeQueued(root)).resolves.toBe(true);
    await vi.waitFor(
      () => expect(dispatch).toHaveBeenCalledOnce(),
      dispatchWait,
    );
    expect(credentials).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session" }),
    );
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      workspaceRootPath: root,
      messageId: message.id,
    });
    expect(dispatch.mock.calls[0][1]).toMatchObject({
      providerConfig: { apiKey: "host-owned-key" },
    });
    await vi.waitFor(async () =>
      expect(
        await second.service.state.listQueuedAgentInputs("session"),
      ).toEqual([]),
    );
    await expect(resumeQueued(root)).resolves.toBe(false);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("retains inputs when credentials fail and supports an explicit retry without the desktop", async () => {
    const root = await seed();
    const credentials = vi
      .spyOn(ProviderCredentials.prototype, "forSession")
      .mockRejectedValue(new Error("System credential store is unavailable"));
    const dispatch = vi
      .spyOn(AgentRuntimeManager.prototype, "sendSessionMessage")
      .mockResolvedValue(message);
    const second = await start(root);
    await expect(resumeQueued(root)).resolves.toBe(false);
    expect(credentials).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    expect(await second.service.state.listQueuedAgentInputs("session")).toEqual(
      [expect.objectContaining({ messageId: message.id })],
    );
    expect(await second.service.state.getMessageById(message.id)).toEqual({
      ...message,
      seq: 1,
    });
    expect(
      await second.service.state.listQueuedAgentInputs("session"),
    ).toHaveLength(1);
    credentials.mockResolvedValue(null);
    await expect(resumeQueued(root)).resolves.toBe(true);
    await vi.waitFor(
      () => expect(dispatch).toHaveBeenCalledOnce(),
      dispatchWait,
    );
  });

  it("keeps archived tasks queued until an explicit restore and resume", async () => {
    const root = await seed(true);
    const credentials = vi
      .spyOn(ProviderCredentials.prototype, "forSession")
      .mockResolvedValue(null);
    const dispatch = vi
      .spyOn(AgentRuntimeManager.prototype, "sendSessionMessage")
      .mockResolvedValue(message);
    const second = await start(root);
    await vi.waitFor(() =>
      expect(second.service.getActiveWork().agentTurns).toBe(0),
    );
    expect(credentials).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    await requestDaemon(
      "session.restore",
      { sessionId: "session" },
      { userDataPath: root },
    );
    await requestDaemon(
      "session.resumeQueued",
      { sessionId: "session" },
      { userDataPath: root },
    );
    await vi.waitFor(
      () => expect(dispatch).toHaveBeenCalledOnce(),
      dispatchWait,
    );
  });

  it("rejects externally supplied runtime credentials", async () => {
    const root = await seed(true);
    const daemon = await start(root);
    await expect(
      requestDaemon(
        "session.send",
        {
          sessionId: "session",
          content: "Run",
          providerConfig: { apiKey: "client-key" },
        } as never,
        { userDataPath: root },
      ),
    ).rejects.toThrow("Unexpected field");
    expect(await daemon.service.state.getSession("session")).toMatchObject({
      archivedAt: timestamp,
      title: "Task",
      status: "idle",
    });
  });
});
