import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import type { CocurdexDaemonEvent, SessionRecord } from "@cocurdex/shared";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import {
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";
import { createGitRepository } from "./helpers/git-repository";

function completedRun(events: CocurdexDaemonEvent[], sessionId: string) {
  return events.some(
    (event) =>
      event.type === "run.updated" &&
      event.sessionId === sessionId &&
      event.run.status === "completed",
  );
}

describe("session fork over the real socket", () => {
  it("forks a Pi session natively through the CLI, whole or from a turn", async () => {
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
      const source = await requestDaemon(
        "session.configure",
        {
          id: crypto.randomUUID(),
          workspaceId: "e2e-workspace",
          title: "Source",
          agentType: "pi",
          writeMode: "read-only",
          sessionModeId: null,
          providerSnapshot: await saveStubProvider(daemon, stub),
        },
        daemon.options,
      );
      stub.plan = { kind: "stream", chunks: ["Found the parser"] };
      const firstPrompt = crypto.randomUUID();
      await requestDaemon(
        "session.send",
        {
          sessionId: source.id,
          messageId: firstPrompt,
          content: "Where is the parser?",
        },
        daemon.options,
      );
      await waitFor(() => completedRun(events, source.id));
      events.length = 0;
      stub.plan = { kind: "stream", chunks: ["Parser rewritten"] };
      await requestDaemon(
        "session.send",
        {
          sessionId: source.id,
          messageId: crypto.randomUUID(),
          content: "Rewrite the parser",
        },
        daemon.options,
      );
      await waitFor(() => completedRun(events, source.id));

      const forkThenSend = async (args: string[], content: string) => {
        const forked = await runCli(
          ["session", "fork", source.id, ...args, "--json"],
          { userDataPath: daemon.userDataPath },
        );
        expect(forked.stderr).toBe("");
        const fork = JSON.parse(forked.stdout) as SessionRecord;
        expect(fork.id).not.toBe(source.id);
        stub.plan = { kind: "stream", chunks: ["Tangent done"] };
        await requestDaemon(
          "session.send",
          { sessionId: fork.id, messageId: crypto.randomUUID(), content },
          daemon.options,
        );
        await waitFor(() => completedRun(events, fork.id));
        const body =
          stub.requests
            .map((request) => JSON.stringify(request.body))
            .find((text) => text.includes(content)) ?? "";
        const transfers = await requestDaemon(
          "session.contextTransfers",
          { sessionId: fork.id },
          daemon.options,
        );
        return { body, transfers };
      };

      const whole = await forkThenSend([], "Try another approach");
      expect(whole.body).not.toContain("cocurdex_context_handoff");
      expect(whole.body).toContain("Where is the parser?");
      expect(whole.body).toContain("Parser rewritten");
      expect(whole.transfers).toMatchObject([
        {
          kind: "fork",
          status: "consumed",
          strategy: "native",
          sourceSessionId: source.id,
          targetAgentType: "pi",
          coveredMessageCount: 4,
        },
      ]);

      const partial = await forkThenSend(
        ["--through", firstPrompt],
        "Explain the parser instead",
      );
      expect(partial.body).not.toContain("cocurdex_context_handoff");
      expect(partial.body).toContain("Found the parser");
      expect(partial.body).not.toContain("Rewrite the parser");
      expect(partial.transfers).toMatchObject([
        { kind: "fork", status: "consumed", strategy: "native" },
      ]);
    } finally {
      subscription.close();
      await daemon.dispose();
      await stub.close();
      await repo.dispose();
    }
  });
});
