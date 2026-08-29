import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AgentSteeringUnavailableError,
  createAgentRegistry,
} from "@cocurdex/agent-core";
import type {
  MessageRecord,
  SendSessionMessagePayload,
  SessionRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CocurdexDaemonService } from "./service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function createSession(): SessionRecord {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Queue test",
    agentType: "pi",
    status: "idle",
    writeMode: "read-only",
    collaborationMode: "default",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    lastMessageAt: null,
  };
}

function createWorkspace(): WorkspaceRecord {
  return {
    id: "workspace-1",
    name: "Queue test",
    rootPath: "/tmp/queue-test",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    lastOpenedAt: "2026-08-02T00:00:00.000Z",
  };
}

function createPayload(
  content: string,
  delivery: SendSessionMessagePayload["delivery"],
): SendSessionMessagePayload {
  return {
    session: createSession(),
    workspaceRootPath: "/tmp/queue-test",
    content,
    delivery,
  };
}

function createRuntimeMessage(content: string): MessageRecord {
  return {
    id: crypto.randomUUID(),
    sessionId: "session-1",
    role: "user",
    content,
    attachments: [],
    createdAt: new Date().toISOString(),
  };
}

async function createService(existingUserDataPath?: string) {
  const userDataPath =
    existingUserDataPath ??
    (await mkdtemp(path.join(tmpdir(), "cocurdex-queue-")));
  if (!existingUserDataPath) temporaryDirectories.push(userDataPath);
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "test",
    userDataPath,
  });
  const pi = createAgentRegistry()
    .list()
    .find((agent) => agent.id === "pi");
  if (!pi) throw new Error("Pi descriptor not found");
  vi.spyOn(service, "listAgents").mockResolvedValue([
    { ...pi, availability: "available" },
  ]);
  await service.saveWorkspace(createWorkspace());
  await service.createSession({
    session: createSession(),
    workspaceRootPath: "/tmp/queue-test",
  });
  return service;
}

describe("CocurdexDaemonService follow-up queue", () => {
  it("registers the session runtime before the first send returns", async () => {
    const service = await createService();
    let releaseHistory: (() => void) | undefined;
    const history = new Promise<MessageRecord[]>((resolve) => {
      releaseHistory = () => resolve([]);
    });
    vi.spyOn(service.state, "listMessagesBySessionId").mockReturnValueOnce(
      history,
    );
    const send = vi
      .spyOn(service.runtime, "sendSessionMessage")
      .mockResolvedValue(createRuntimeMessage("First turn"));

    await service.sendSessionMessage(
      createPayload("First turn", "start-new-run"),
      null,
    );

    expect(service.runtime.getAgentSession("session-1")).not.toBeNull();
    releaseHistory?.();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await service.shutdown();
  });

  it("falls back to the durable queue when native steering is rejected", async () => {
    const service = await createService();
    let completeActiveTurn: (() => void) | undefined;
    const activeTurn = new Promise<MessageRecord>((resolve) => {
      completeActiveTurn = () => resolve(createRuntimeMessage("First turn"));
    });
    const send = vi
      .spyOn(service.runtime, "sendSessionMessage")
      .mockImplementationOnce(() => activeTurn)
      .mockRejectedValueOnce(
        new AgentSteeringUnavailableError("Grok Build steering is unavailable"),
      )
      .mockResolvedValue(createRuntimeMessage("Queued after failed steer"));

    await service.sendSessionMessage(
      createPayload("First turn", "start-new-run"),
      null,
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());

    const steered = await service.sendSessionMessage(
      createPayload("Queue me if steering fails", "steer-active-run"),
      null,
    );
    await vi.waitFor(async () => {
      const state = await service.bootstrap();
      expect(state.queuedAgentInputs).toEqual([
        expect.objectContaining({ messageId: steered.id }),
      ]);
    });

    completeActiveTurn?.();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls[2]?.[0]).toMatchObject({
      messageId: steered.id,
      content: "Queue me if steering fails",
      delivery: "start-new-run",
    });
    await vi.waitFor(async () => {
      const state = await service.bootstrap();
      expect(state.queuedAgentInputs).toEqual([]);
    });

    await service.shutdown();
  });

  it("starts a queued follow-up only after the active turn completes", async () => {
    const service = await createService();
    let completeActiveTurn: (() => void) | undefined;
    const activeTurn = new Promise<MessageRecord>((resolve) => {
      completeActiveTurn = () => resolve(createRuntimeMessage("First turn"));
    });
    const send = vi
      .spyOn(service.runtime, "sendSessionMessage")
      .mockImplementationOnce(() => activeTurn)
      .mockResolvedValue(createRuntimeMessage("Queued follow-up"));

    await service.sendSessionMessage(
      createPayload("First turn", "start-new-run"),
      null,
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());

    await service.sendSessionMessage(
      createPayload("First queued follow-up", "queue-after-run"),
      null,
    );
    await service.sendSessionMessage(
      createPayload("Second queued follow-up", "queue-after-run"),
      null,
    );
    expect(send).toHaveBeenCalledOnce();

    completeActiveTurn?.();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      content: "First queued follow-up",
      delivery: "start-new-run",
    });
    expect(send.mock.calls[1]?.[1].history).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "Second queued follow-up" }),
      ]),
    );
    expect(send.mock.calls[2]?.[0]).toMatchObject({
      content: "Second queued follow-up",
      delivery: "start-new-run",
    });

    await service.shutdown();
  });

  it("edits, deletes, and steers durable queued inputs", async () => {
    const service = await createService();
    const activeTurn = new Promise<MessageRecord>(() => {});
    const send = vi
      .spyOn(service.runtime, "sendSessionMessage")
      .mockImplementationOnce(() => activeTurn)
      .mockResolvedValue(createRuntimeMessage("Steered follow-up"));
    const emit = vi.spyOn(service.runtime, "emitAgentEvent");

    await service.sendSessionMessage(
      createPayload("First turn", "start-new-run"),
      null,
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const firstQueued = await service.sendSessionMessage(
      createPayload("Edit me", "queue-after-run"),
      null,
    );
    const secondQueued = await service.sendSessionMessage(
      createPayload("Delete me", "queue-after-run"),
      null,
    );

    await expect(
      service.updateQueuedAgentInput(
        "session-1",
        firstQueued.id,
        "Edited follow-up",
      ),
    ).resolves.toMatchObject({ content: "Edited follow-up" });
    await service.deleteQueuedAgentInput("session-1", secondQueued.id);

    const beforeSteer = await service.bootstrap();
    expect(beforeSteer.queuedAgentInputs).toEqual([
      expect.objectContaining({ messageId: firstQueued.id }),
    ]);
    expect(beforeSteer.messages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: secondQueued.id }),
      ]),
    );

    await expect(
      service.steerQueuedAgentInput("session-1", firstQueued.id),
    ).resolves.toMatchObject({ content: "Edited follow-up" });
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      content: "Edited follow-up",
      delivery: "steer-active-run",
    });
    expect(emit).toHaveBeenCalledWith({
      type: "message.completed",
      sessionId: "session-1",
      message: expect.objectContaining({ id: firstQueued.id }),
    });
    expect((await service.bootstrap()).queuedAgentInputs).toEqual([]);

    await service.shutdown();
  });

  it("persists accepted follow-ups across daemon restarts", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-queue-restart-"),
    );
    temporaryDirectories.push(userDataPath);
    const service = await createService(userDataPath);
    let completeActiveTurn: (() => void) | undefined;
    const activeTurn = new Promise<MessageRecord>((resolve) => {
      completeActiveTurn = () => resolve(createRuntimeMessage("First turn"));
    });
    vi.spyOn(service.runtime, "sendSessionMessage").mockReturnValue(activeTurn);

    await service.sendSessionMessage(
      createPayload("First turn", "start-new-run"),
      null,
    );
    await service.sendSessionMessage(
      createPayload("Survive restart", "queue-after-run"),
      null,
    );
    await service.shutdown();

    const restarted = await createService(userDataPath);
    const bootstrap = (await restarted.bootstrap()) as unknown as {
      queuedAgentInputs: Array<{ messageId: string; sessionId: string }>;
    };
    expect(bootstrap.queuedAgentInputs).toEqual([
      expect.objectContaining({ sessionId: "session-1" }),
    ]);

    const resumedSend = vi
      .spyOn(restarted.runtime, "sendSessionMessage")
      .mockResolvedValue(createRuntimeMessage("Survive restart"));
    await expect(
      restarted.resumeQueuedSession("session-1", null),
    ).resolves.toBe(true);
    await vi.waitFor(() => expect(resumedSend).toHaveBeenCalledOnce());
    expect(resumedSend.mock.calls[0]?.[0]).toMatchObject({
      content: "Survive restart",
      delivery: "start-new-run",
    });
    await vi.waitFor(async () => {
      const state = await restarted.bootstrap();
      expect(state.queuedAgentInputs).toEqual([]);
    });

    completeActiveTurn?.();
    await restarted.shutdown();
  });
});
