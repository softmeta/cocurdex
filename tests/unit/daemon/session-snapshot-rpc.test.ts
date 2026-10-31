import { handleDaemonRequest } from "@cocurdex/daemon/internal/handler";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { DaemonRequest } from "@cocurdex/rpc";
import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

const now = "2026-08-09T10:00:00.000Z";

afterEach(async () => {
  await tempDirs.cleanup();
});

async function createService() {
  const userDataPath = await tempDirs.create("cocurdex-session-snapshot-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "session-snapshot-test",
    userDataPath,
  });
  const workspace = {
    id: "workspace-1",
    name: "Snapshot workspace",
    rootPaths: ["/tmp/snapshot-workspace"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  } satisfies WorkspaceRecord;
  const session = {
    id: "session-1",
    workspaceId: workspace.id,
    title: "Snapshot session",
    agentType: "codex",
    status: "running",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  } satisfies SessionRecord;
  await service.saveWorkspace(workspace);
  await service.state.saveSession(session);
  return service;
}

describe("session snapshot RPC", () => {
  it("combines durable state with live output and pending interactions", async () => {
    const service = await createService();
    await service.state.persistAgentEvent({
      type: "message.delta",
      sessionId: "session-1",
      messageId: "assistant-1",
      role: "assistant",
      kind: "response",
      delta: "Streaming",
      createdAt: now,
    });
    void service.runtime.requestAgentPermission({
      id: "permission-1",
      sessionId: "session-1",
      providerId: "codex",
      kind: "command",
      title: "Run tests",
      locations: [],
      options: [
        {
          id: "allow",
          kind: "allow_once",
          label: "Allow once",
          labelSource: "generic",
        },
      ],
    });
    service.runtime.emitAgentEvent({
      type: "plan.updated",
      sessionId: "session-1",
      plan: {
        steps: [{ step: "Inspect files", status: "in_progress" }],
        updatedAt: now,
      },
    });

    const request = {
      id: "1",
      method: "session.snapshot",
      params: { sessionId: "session-1" },
      token: "test",
    } satisfies DaemonRequest<"session.snapshot">;
    const snapshot = await handleDaemonRequest<"session.snapshot">(
      service,
      request,
    );

    expect(snapshot).toMatchObject({
      session: { id: "session-1" },
      activeMessages: [{ id: "assistant-1", content: "Streaming" }],
      interactions: {
        permissions: [{ id: "permission-1" }],
      },
      plan: { steps: [{ step: "Inspect files" }] },
    });
    service.runtime.resolveAgentPermission("permission-1", "cancelled");
    await service.shutdown();
  });

  it("returns null for an unknown session", async () => {
    const service = await createService();

    await expect(
      handleDaemonRequest<"session.snapshot">(service, {
        id: "1",
        method: "session.snapshot",
        params: { sessionId: "missing" },
        token: "test",
      }),
    ).resolves.toBeNull();
    await service.shutdown();
  });
});

describe("app resync RPC", () => {
  it("returns authoritative state bounded by the journal position", async () => {
    const service = await createService();
    await service.state.persistAgentEvent({
      type: "message.delta",
      sessionId: "session-1",
      messageId: "assistant-1",
      role: "assistant",
      kind: "response",
      delta: "Streaming",
      createdAt: now,
    });
    void service.runtime.requestAgentPermission({
      id: "permission-1",
      sessionId: "session-1",
      providerId: "codex",
      kind: "command",
      title: "Run tests",
      locations: [],
      options: [
        {
          id: "allow",
          kind: "allow_once",
          label: "Allow once",
          labelSource: "generic",
        },
      ],
    });
    service.runtime.emitAgentEvent({
      type: "plan.updated",
      sessionId: "session-1",
      plan: {
        steps: [{ step: "Inspect files", status: "in_progress" }],
        updatedAt: now,
      },
    });
    service.bindEventSeqProvider(() => 41);

    const snapshot = await handleDaemonRequest<"sync.pull">(service, {
      id: "1",
      method: "sync.pull",
      params: { sessionIds: ["session-1", "missing"] },
      token: "test",
    });

    expect(snapshot).toMatchObject({
      mode: "full",
      epoch: service.status().startedAt,
      eventSeq: 41,
      sessions: [{ id: "session-1" }],
      interactions: {
        permissions: [{ id: "permission-1" }],
      },
      transcripts: {
        "session-1": {
          activeMessages: [{ id: "assistant-1", content: "Streaming" }],
          plan: { steps: [{ step: "Inspect files" }] },
        },
      },
    });
    service.runtime.resolveAgentPermission("permission-1", "cancelled");
    await service.shutdown();
  });
});
