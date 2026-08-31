import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { afterEach, describe, expect, it } from "vitest";
import { CocurdexDaemonService } from "./service";

const temporaryDirectories: string[] = [];
const now = "2026-08-31T00:00:00.000Z";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createService() {
  const userDataPath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-subagent-persist-"),
  );
  temporaryDirectories.push(userDataPath);
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "subagent-persist-test",
    userDataPath,
  });
  const workspace = {
    id: "workspace-1",
    name: "Repo",
    rootPath: "/tmp/subagent-workspace",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  } satisfies WorkspaceRecord;
  const session = {
    id: "session-1",
    workspaceId: workspace.id,
    title: "Parent",
    agentType: "claude-agent",
    status: "running",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  } satisfies SessionRecord;
  await service.saveWorkspace(workspace);
  await service.state.saveSession(session);
  return service;
}

describe("DaemonState subagent persistence", () => {
  it("creates a child session from a subagent tool call for any adapter", async () => {
    const service = await createService();

    await service.state.persistAgentEvent({
      type: "tool.started",
      sessionId: "session-1",
      toolCall: {
        id: "task-1",
        sessionId: "session-1",
        title: "Using subagent",
        kind: "task",
        status: "in_progress",
        subagent: {
          sessionId: "claude-subagent:session-1:task-1",
          type: "reviewer",
          description: "Review changes",
        },
        content: [],
        locations: [],
        startedAt: now,
        updatedAt: now,
      },
    });

    const listed = await service.listSessions();
    expect(listed.map((session) => session.id).sort()).toEqual([
      "claude-subagent:session-1:task-1",
      "session-1",
    ]);
    expect(
      listed.find(
        (session) => session.id === "claude-subagent:session-1:task-1",
      ),
    ).toMatchObject({
      parentSessionId: "session-1",
      sessionKind: "subagent",
      title: "Review changes",
    });

    await service.shutdown();
  });
});
