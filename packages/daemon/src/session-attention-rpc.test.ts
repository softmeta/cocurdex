import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DaemonRequest } from "@cocurdex/rpc";
import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { afterEach, describe, expect, it } from "vitest";
import { handleDaemonRequest } from "./handler";
import { CocurdexDaemonService } from "./service";

const temporaryDirectories: string[] = [];
const now = "2026-08-09T10:00:00.000Z";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createService(userDataPath?: string) {
  const targetPath =
    userDataPath ??
    (await mkdtemp(path.join(tmpdir(), "cocurdex-attention-rpc-")));
  if (!userDataPath) {
    temporaryDirectories.push(targetPath);
  }
  return new CocurdexDaemonService({
    runtimeFingerprint: "attention-test",
    userDataPath: targetPath,
  });
}

async function seedSession(service: CocurdexDaemonService) {
  const workspace = {
    id: "workspace-1",
    name: "Attention workspace",
    rootPath: "/tmp/attention-workspace",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  } satisfies WorkspaceRecord;
  const session = {
    id: "session-1",
    workspaceId: workspace.id,
    title: "Attention session",
    agentType: "codex",
    status: "idle",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  } satisfies SessionRecord;
  await service.saveWorkspace(workspace);
  await service.state.saveSession(session);
}

describe("session attention RPC", () => {
  it("persists a settled lifecycle across daemon restarts", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-attention-restart-"),
    );
    temporaryDirectories.push(userDataPath);
    const service = await createService(userDataPath);
    await seedSession(service);

    const updateRequest = {
      id: "1",
      method: "attention.update",
      params: { sessionId: "session-1", action: "settle", at: now },
      token: "test",
    } satisfies DaemonRequest<"attention.update">;
    await handleDaemonRequest<"attention.update">(service, updateRequest);
    await service.shutdown();

    const restarted = await createService(userDataPath);
    const listRequest = {
      id: "2",
      method: "attention.list",
      token: "test",
    } satisfies DaemonRequest<"attention.list">;

    await expect(
      handleDaemonRequest<"attention.list">(restarted, listRequest),
    ).resolves.toEqual([
      expect.objectContaining({
        sessionId: "session-1",
        resultDisposition: "settled",
        runtimeState: "ready",
        attentionState: "none",
        primaryState: "ready",
      }),
    ]);
    await restarted.shutdown();
  });

  it("projects pending permission events without exposing provider details", async () => {
    const service = await createService();
    await seedSession(service);
    const listRequest = {
      id: "2",
      method: "attention.list",
      token: "test",
    } satisfies DaemonRequest<"attention.list">;

    service.runtime.emitAgentEvent({
      type: "permission.requested",
      sessionId: "session-1",
      request: {
        id: "permission-1",
        sessionId: "session-1",
        providerId: "codex",
        kind: "command",
        title: "Run command",
        locations: [],
        options: [],
        status: "pending",
        createdAt: now,
        updatedAt: now,
      },
    });

    await expect
      .poll(async () => {
        const snapshots = await handleDaemonRequest<"attention.list">(
          service,
          listRequest,
        );
        return snapshots[0]?.primaryState;
      })
      .toBe("pending-approval");
    await service.shutdown();
  });

  it("projects questions ahead of plan reviews and clears resolved requests", async () => {
    const service = await createService();
    await seedSession(service);
    const listRequest = {
      id: "2",
      method: "attention.list",
      token: "test",
    } satisfies DaemonRequest<"attention.list">;
    const question = {
      id: "question-1",
      sessionId: "session-1",
      providerId: "codex" as const,
      question: "Which option?",
      status: "pending" as const,
      createdAt: now,
      updatedAt: now,
    };
    const approval = {
      id: "plan-1",
      sessionId: "session-1",
      providerId: "codex" as const,
      planContent: "Implement the change",
      source: "inline" as const,
      status: "pending" as const,
      createdAt: now,
      updatedAt: now,
    };

    service.runtime.emitAgentEvent({
      type: "plan.approval.requested",
      sessionId: "session-1",
      approval,
    });
    service.runtime.emitAgentEvent({
      type: "question.requested",
      sessionId: "session-1",
      question,
    });

    await expect
      .poll(async () => {
        const snapshots = await handleDaemonRequest<"attention.list">(
          service,
          listRequest,
        );
        return snapshots[0]?.primaryState;
      })
      .toBe("awaiting-input");

    service.runtime.emitAgentEvent({
      type: "question.resolved",
      sessionId: "session-1",
      question: { ...question, status: "answered", answer: "A" },
    });
    await expect
      .poll(async () => {
        const snapshots = await handleDaemonRequest<"attention.list">(
          service,
          listRequest,
        );
        return snapshots[0]?.primaryState;
      })
      .toBe("plan-ready");
    await service.shutdown();
  });

  it("persists a new assistant result as unread and clears settled", async () => {
    const userDataPath = await mkdtemp(
      path.join(tmpdir(), "cocurdex-attention-result-"),
    );
    temporaryDirectories.push(userDataPath);
    const service = await createService(userDataPath);
    await seedSession(service);
    await handleDaemonRequest<"attention.update">(service, {
      id: "1",
      method: "attention.update",
      params: { sessionId: "session-1", action: "settle", at: now },
      token: "test",
    });
    const completedAt = "2026-08-09T10:05:00.000Z";

    service.runtime.emitAgentEvent({
      type: "message.completed",
      sessionId: "session-1",
      message: {
        id: "message-1",
        sessionId: "session-1",
        role: "assistant",
        kind: "response",
        content: "Finished",
        attachments: [],
        createdAt: completedAt,
      },
    });

    const listRequest = {
      id: "2",
      method: "attention.list",
      token: "test",
    } satisfies DaemonRequest<"attention.list">;
    await expect
      .poll(async () => {
        const snapshots = await handleDaemonRequest<"attention.list">(
          service,
          listRequest,
        );
        return snapshots[0];
      })
      .toEqual(
        expect.objectContaining({
          latestResultAt: completedAt,
          resultDisposition: "automatic",
          primaryState: "completed-unread",
        }),
      );
    await service.shutdown();

    const restarted = await createService(userDataPath);
    await expect(
      handleDaemonRequest<"attention.list">(restarted, listRequest),
    ).resolves.toEqual([
      expect.objectContaining({
        latestResultAt: completedAt,
        primaryState: "completed-unread",
      }),
    ]);
    await restarted.shutdown();
  });

  it("unsettles a session when a new interaction requests attention", async () => {
    const service = await createService();
    await seedSession(service);
    await handleDaemonRequest<"attention.update">(service, {
      id: "1",
      method: "attention.update",
      params: { sessionId: "session-1", action: "settle", at: now },
      token: "test",
    });
    const requestedAt = "2026-08-09T10:01:00.000Z";
    service.runtime.emitAgentEvent({
      type: "permission.requested",
      sessionId: "session-1",
      request: {
        id: "permission-2",
        sessionId: "session-1",
        providerId: "codex",
        kind: "command",
        title: "Run command",
        locations: [],
        options: [],
        status: "pending",
        createdAt: requestedAt,
        updatedAt: requestedAt,
      },
    });

    const listRequest = {
      id: "2",
      method: "attention.list",
      token: "test",
    } satisfies DaemonRequest<"attention.list">;
    await expect
      .poll(async () => {
        const snapshots = await handleDaemonRequest<"attention.list">(
          service,
          listRequest,
        );
        return snapshots[0]?.resultDisposition;
      })
      .toBe("automatic");
    await service.shutdown();
  });
});
