import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import {
  CHAT_WORKSPACE_ID,
  type CocurdexDaemonEvent,
  type MessageRecord,
} from "@cocurdex/shared";
import { startChatSession } from "@cocurdex/test-harness/helpers/chat-session";
import {
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";

function completedResponses(events: CocurdexDaemonEvent[]): MessageRecord[] {
  return events.flatMap((event) =>
    event.type === "message.completed" &&
    event.message.role === "assistant" &&
    event.message.kind === "response"
      ? [event.message]
      : [],
  );
}

function hasStatus(
  events: CocurdexDaemonEvent[],
  sessionId: string,
  status: string,
) {
  return events.some(
    (event) =>
      event.type === "state.changed" &&
      event.sessionId === sessionId &&
      event.status === status,
  );
}

describe("chat sessions over a stubbed OpenAI-compatible provider", () => {
  it("answers through Pi without tools or project context", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const session = await startChatSession(daemon, stub);
      expect(session.sessionKind).toBe("chat");
      stub.plan = { kind: "stream", chunks: ["Hello", " from", " stub"] };

      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "hi there",
        },
        daemon.options,
      );

      await waitFor(() => completedResponses(events).length > 0);
      expect(completedResponses(events)[0]?.content).toBe("Hello from stub");

      const request = stub.requests[0];
      expect(request?.path).toBe("/v1/chat/completions");
      expect(request?.authorization).toBe("Bearer e2e-key");
      expect(request?.body.tools ?? []).toEqual([]);
      expect(JSON.stringify(request?.body.messages)).toContain(
        "helpful assistant",
      );

      const workspaces = await requestDaemon("workspace.list", daemon.options);
      expect(
        workspaces.find((workspace) => workspace.id === CHAT_WORKSPACE_ID)
          ?.rootPaths,
      ).toHaveLength(1);
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });

  it("stops an in-flight answer", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const session = await startChatSession(daemon, stub);
      stub.plan = { kind: "hang" };

      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "wait",
        },
        daemon.options,
      );
      await stub.nextRequest();
      await requestDaemon(
        "session.stop",
        { sessionId: session.id },
        daemon.options,
      );
      await waitFor(() => hasStatus(events, session.id, "idle"));
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
