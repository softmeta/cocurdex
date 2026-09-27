import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  AgentToolCallRecord,
  MessageRecord,
  SessionRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { afterEach, describe, expect, it } from "vitest";
import { CocurdexDaemonService } from "./service";

const temporaryDirectories: string[] = [];
const now = "2026-09-27T00:00:00.000Z";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createService() {
  const userDataPath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-timeline-seq-"),
  );
  temporaryDirectories.push(userDataPath);
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "timeline-seq-test",
    userDataPath,
  });
  const workspace = {
    id: "workspace-1",
    name: "Timeline workspace",
    rootPaths: ["/tmp/timeline-workspace"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  } satisfies WorkspaceRecord;
  const session = {
    id: "session-1",
    workspaceId: workspace.id,
    title: "Timeline",
    agentType: "opencode",
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

const userMessage = {
  id: "user-1",
  sessionId: "session-1",
  role: "user",
  content: "Fix the bug",
  attachments: [],
  createdAt: "2026-09-27T00:00:01.000Z",
} satisfies MessageRecord;

const assistantMessage = {
  id: "assistant-1",
  sessionId: "session-1",
  role: "assistant",
  kind: "response",
  content: "Looking at it",
  attachments: [],
  createdAt: "2026-09-27T00:00:02.000Z",
} satisfies MessageRecord;

const toolCall = {
  id: "tool-1",
  sessionId: "session-1",
  title: "read file.ts",
  status: "completed",
  content: [],
  locations: [],
  startedAt: "2026-09-27T00:00:03.000Z",
  updatedAt: "2026-09-27T00:00:03.000Z",
} satisfies AgentToolCallRecord;

const assistantDelta = {
  type: "message.delta",
  sessionId: "session-1",
  messageId: assistantMessage.id,
  role: "assistant",
  kind: "response",
  delta: "Looking",
  createdAt: assistantMessage.createdAt,
} as const;

async function streamTurn(service: CocurdexDaemonService) {
  return [
    await service.state.saveUserMessage(userMessage),
    await service.state.persistAgentEvent(assistantDelta),
    await service.state.persistAgentEvent({
      type: "tool.started",
      sessionId: "session-1",
      toolCall,
    }),
    await service.state.persistAgentEvent({ ...assistantDelta, delta: " at" }),
    await service.state.persistAgentEvent({
      type: "message.completed",
      sessionId: "session-1",
      message: assistantMessage,
    }),
  ];
}

describe("DaemonState timeline sequence", () => {
  it("returns every live record with the seq it was stored under", async () => {
    const service = await createService();
    try {
      const [user, delta, tool, laterDelta, completed] =
        await streamTurn(service);

      expect(user).toMatchObject({ id: "user-1", seq: 1 });
      expect(delta).toMatchObject({ type: "message.delta", seq: 2 });
      expect(tool).toMatchObject({ toolCall: { id: "tool-1", seq: 3 } });
      expect(laterDelta).toMatchObject({ type: "message.delta", seq: 2 });
      expect(completed).toMatchObject({
        message: { id: "assistant-1", seq: 2 },
      });
    } finally {
      await service.shutdown();
    }
  });

  it("orders a streamed message by its first delta, not by when it is persisted", async () => {
    const service = await createService();
    try {
      await streamTurn(service);

      const messages = await service.state.listMessagesBySessionId("session-1");
      const toolCalls =
        await service.state.listToolCallsBySessionId("session-1");
      expect(messages.map(({ id, seq }) => ({ id, seq }))).toEqual([
        { id: "user-1", seq: 1 },
        { id: "assistant-1", seq: 2 },
      ]);
      expect(toolCalls.map(({ id, seq }) => ({ id, seq }))).toEqual([
        { id: "tool-1", seq: 3 },
      ]);
    } finally {
      await service.shutdown();
    }
  });

  it("returns the persisted system message with an error event", async () => {
    const service = await createService();
    try {
      await streamTurn(service);

      const event = await service.state.persistAgentEvent({
        type: "error",
        sessionId: "session-1",
        message: "Provider failed",
      });

      const messages = await service.state.listMessagesBySessionId("session-1");
      expect(messages.at(-1)).toMatchObject({
        role: "system",
        content: "Provider failed",
        seq: 4,
      });
      expect(event).toEqual({
        type: "error",
        sessionId: "session-1",
        message: "Provider failed",
        systemMessage: messages.at(-1),
      });
    } finally {
      await service.shutdown();
    }
  });

  it("rewinds everything recorded after the edited message", async () => {
    const service = await createService();
    try {
      await streamTurn(service);

      await service.state.rewindSessionMessages({
        ...userMessage,
        content: "Fix the other bug",
      });

      const messages = await service.state.listMessagesBySessionId("session-1");
      expect(messages).toEqual([
        { ...userMessage, content: "Fix the other bug", seq: 1 },
      ]);
      expect(await service.state.listToolCallsBySessionId("session-1")).toEqual(
        [],
      );
    } finally {
      await service.shutdown();
    }
  });
});
