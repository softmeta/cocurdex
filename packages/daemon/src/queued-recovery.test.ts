import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgentRegistry } from "@cocurdex/agent-core";
import type { MessageRecord } from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestDaemon } from "./client";
import { ProviderCredentials } from "./provider-credentials/service";
import { AgentRuntimeManager } from "./runtime";
import { CocurdexDaemonService } from "./service";
import { startDaemonServer } from "./wire";

const directories: string[] = [];
const daemons: Awaited<ReturnType<typeof startDaemonServer>>[] = [];
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
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
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
  const root = await mkdtemp(path.join(tmpdir(), "cdq-"));
  directories.push(root);
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
    collaborationMode: "default",
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
  it("does not start a recovered task when shutdown arrives during credential resolution", async () => {
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
    await vi.waitFor(() => expect(credentials).toHaveBeenCalledOnce());
    const closing = second.close();
    await new Promise<void>((resolve) => setImmediate(resolve));
    release();
    await closing;
    expect(dispatch).not.toHaveBeenCalled();
    await start(root);
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  });

  it("starts persisted inputs before any client bootstrap and uses current host credentials and paths", async () => {
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
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
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
    await requestDaemon("app.bootstrap", { userDataPath: root });
    await requestDaemon("app.bootstrap", { userDataPath: root });
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
    await vi.waitFor(() => expect(credentials).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(second.service.getActiveWork().agentTurns).toBe(0),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(await second.service.state.listQueuedAgentInputs("session")).toEqual(
      [expect.objectContaining({ messageId: message.id })],
    );
    expect(await second.service.state.getMessageById(message.id)).toEqual(
      message,
    );
    await expect(
      requestDaemon(
        "session.resumeQueued",
        { sessionId: "session" },
        { userDataPath: root },
      ),
    ).resolves.toBe(false);
    expect(
      await second.service.state.listQueuedAgentInputs("session"),
    ).toHaveLength(1);
    credentials.mockResolvedValue(null);
    await expect(
      requestDaemon(
        "session.resumeQueued",
        { sessionId: "session" },
        { userDataPath: root },
      ),
    ).resolves.toBe(true);
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
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
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  });

  it("rejects legacy storage mutations and externally supplied runtime credentials", async () => {
    const root = await seed(true);
    const daemon = await start(root);
    for (const operation of [
      "session.save",
      "session.archive",
      "session.restore",
      "session.updateTitle",
      "providerSecret.get",
      "providerSecret.save",
      "providerSecret.delete",
      "providerConfig.setSecret",
    ]) {
      await expect(
        requestDaemon(
          "storage.call",
          { operation, args: [{ id: "session", status: "running" }] },
          { userDataPath: root },
        ),
      ).rejects.toThrow("Unsupported storage operation");
    }
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
