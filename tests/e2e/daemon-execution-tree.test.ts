import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { startChatSession } from "@cocurdex/test-harness/helpers/chat-session";
import {
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

describe("session execution tree over the real socket", () => {
  it("projects a finished run for RPC and CLI clients", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      expect(
        await requestDaemon(
          "session.executionTree",
          { sessionId: "missing" },
          daemon.options,
        ),
      ).toBeNull();
      await expect(
        requestDaemon(
          "session.executionTree",
          { sessionId: "missing", maxDepth: 0 },
          daemon.options,
        ),
      ).rejects.toThrow();

      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const session = await startChatSession(daemon, stub);
      stub.plan = { kind: "stream", chunks: ["Done"] };
      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "hello",
        },
        daemon.options,
      );
      await waitFor(() =>
        events.some(
          (event) =>
            event.type === "run.updated" &&
            event.sessionId === session.id &&
            event.run.status === "completed",
        ),
      );
      subscription.close();

      const tree = await requestDaemon(
        "session.executionTree",
        { sessionId: session.id },
        daemon.options,
      );
      expect(tree?.root.session.id).toBe(session.id);
      expect(tree?.root.runs.map((node) => node.run.status)).toEqual([
        "completed",
      ]);
      expect(tree?.root.children).toEqual([]);

      const cli = await runCli(["session", "tree", session.id], {
        userDataPath: daemon.userDataPath,
      });
      expect(cli.stderr).toBe("");
      expect(cli.stdout).toContain(
        `session Chat (chat, pi) [idle] ${session.id}`,
      );
      expect(cli.stdout).toMatch(/\n {2}run \S+ \[completed\]/);
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
