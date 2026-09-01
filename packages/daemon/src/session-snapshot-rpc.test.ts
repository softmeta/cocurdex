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

async function createService() {
  const userDataPath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-session-snapshot-"),
  );
  temporaryDirectories.push(userDataPath);
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "session-snapshot-test",
    userDataPath,
  });
  const workspace = {
    id: "workspace-1",
    name: "Snapshot workspace",
    rootPath: "/tmp/snapshot-workspace",
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
    collaborationMode: "default",
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
      options: [{ id: "allow", kind: "allow_once", label: "Allow once" }],
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
