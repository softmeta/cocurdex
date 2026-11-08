import { dispatchSessionTurn } from "@cocurdex/daemon/internal/session-control/dispatch-session-turn";
import type { MessageRecord, SessionRecord } from "@cocurdex/shared";
import { expect, it, vi } from "vitest";

it("does not dispatch a turn cancelled while preparing its start context", async () => {
  const timestamp = "2026-11-08T00:00:00.000Z";
  const session: SessionRecord = {
    id: "chat",
    workspaceId: "workspace",
    title: "Chat",
    agentType: "pi",
    sessionKind: "chat",
    writeMode: "read-only",
    status: "running",
    sessionModeId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
  };
  const message: MessageRecord = {
    id: "message",
    sessionId: session.id,
    role: "user",
    content: "Hello",
    attachments: [],
    createdAt: timestamp,
  };
  const controller = new AbortController();
  const sendSessionMessage = vi.fn(async () => message);
  const prepareStartContext = vi.fn(async () => {
    await Promise.resolve();
    controller.abort();
    return { content: message.content, history: [message] };
  });

  await expect(
    dispatchSessionTurn({
      state: {
        listMessagesBySessionId: async () => [message],
        listQueuedAgentInputs: async () => [],
      },
      runtime: { emitAgentEvent: vi.fn(), sendSessionMessage },
      workspaceChanges: {
        beginTurn: vi.fn(),
        failTurn: vi.fn(),
      },
      worktrees: { waitForSetup: vi.fn() },
      payload: {
        session,
        workspaceRootPath: "",
        messageId: message.id,
        content: message.content,
      },
      userMessage: message,
      signal: controller.signal,
      persistence: {
        providerSession: null,
        onProviderSessionUpdate: vi.fn(),
      },
      prepareStartContext,
    }),
  ).resolves.toBeNull();
  expect(prepareStartContext).toHaveBeenCalledOnce();
  expect(sendSessionMessage).not.toHaveBeenCalled();
});
