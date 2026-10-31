import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import {
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";
import { createGitRepository } from "./helpers/git-repository";

function completedRuns(events: CocurdexDaemonEvent[], sessionId: string) {
  return events.filter(
    (event) =>
      event.type === "run.updated" &&
      event.sessionId === sessionId &&
      event.run.status === "completed",
  ).length;
}

describe("scripted tool calls over the real socket", () => {
  it("runs Pi tools the stub requests and records their outcomes", async () => {
    const stub = await startStubLlmServer();
    const repo = await createGitRepository();
    const daemon = await spawnDaemon();
    const events: CocurdexDaemonEvent[] = [];
    const subscription = await subscribeDaemonEvents(
      (event) => events.push(event),
      daemon.options,
    );
    try {
      const now = new Date().toISOString();
      await requestDaemon(
        "workspace.save",
        {
          workspace: {
            id: "e2e-workspace",
            name: "e2e-workspace",
            rootPaths: [repo.path],
            createdAt: now,
            updatedAt: now,
            lastOpenedAt: now,
            sortOrder: 0,
          },
        },
        daemon.options,
      );
      const session = await requestDaemon(
        "session.configure",
        {
          id: crypto.randomUUID(),
          workspaceId: "e2e-workspace",
          title: "Tools",
          agentType: "pi",
          writeMode: "native-write",
          sessionModeId: null,
          providerSnapshot: await saveStubProvider(daemon, stub),
        },
        daemon.options,
      );
      stub.plan = {
        kind: "script",
        turns: [
          {
            text: ["Reading the docs."],
            toolCalls: [
              { name: "read", arguments: { path: "README.md" } },
              { name: "read", arguments: { path: "MISSING.md" } },
            ],
          },
          { text: ["The README is a fixture heading."] },
        ],
      };
      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "What does the README say?",
        },
        daemon.options,
      );
      await waitFor(() => completedRuns(events, session.id) > 0, 20_000);

      const toolCalls = await requestDaemon(
        "session.listToolCalls",
        { sessionId: session.id },
        daemon.options,
      );
      expect(
        toolCalls.map((toolCall) => [toolCall.title, toolCall.status]),
      ).toEqual([
        ["read", "completed"],
        ["read", "failed"],
      ]);
      const { messages } = await requestDaemon(
        "session.listMessages",
        { sessionId: session.id },
        daemon.options,
      );
      expect(messages.map((message) => message.content)).toContain(
        "The README is a fixture heading.",
      );
      expect(stub.plan).toEqual({ kind: "script", turns: [] });
    } finally {
      subscription.close();
      await daemon.dispose();
      await repo.dispose();
      await stub.close();
    }
  });
});
