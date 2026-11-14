import { rm } from "node:fs/promises";
import path from "node:path";
import {
  DURABLE_DATABASE_FILENAME,
  killProcessTree,
} from "@cocurdex/agent-adapters";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { MessageRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { startChatSession } from "@cocurdex/test-harness/helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

async function crash(daemon: DaemonProcess) {
  if (process.platform === "win32" && daemon.child.pid) {
    await killProcessTree(daemon.child.pid);
  } else {
    daemon.child.kill("SIGKILL");
  }
  await daemon.exit;
}

async function snapshot(daemon: DaemonProcess, sessionId: string) {
  const result = await requestDaemon(
    "session.snapshot",
    { sessionId },
    daemon.options,
  );
  if (!result) throw new Error(`Session ${sessionId} was not found`);
  return result;
}

async function waitForResponses(
  daemon: DaemonProcess,
  sessionId: string,
  count: number,
) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await snapshot(daemon, sessionId);
    if (responses(state.messages).length >= count && !state.activeRun) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${count} answers`);
}

function waitForAnswer(daemon: DaemonProcess, sessionId: string) {
  return waitForResponses(daemon, sessionId, 1);
}

function responses(messages: MessageRecord[]) {
  return messages.filter(
    (message) => message.role === "assistant" && message.kind === "response",
  );
}

describe("durable assistant and chat runs across daemon restarts", () => {
  it("finishes a chat answer the daemon crashed in", async () => {
    const stub = await startStubLlmServer();
    const userDataPath = tempDirs.createSync("cocu-durable-");
    let daemon = await spawnDaemon({ userDataPath });
    try {
      const session = await startChatSession(daemon, stub);
      stub.plan = { kind: "hang" };
      const messageId = crypto.randomUUID();
      await requestDaemon(
        "session.send",
        { sessionId: session.id, messageId, content: "Are you still there?" },
        daemon.options,
      );
      await stub.nextRequest();
      await crash(daemon);

      stub.plan = { kind: "stream", chunks: ["Still", " here"] };
      daemon = await spawnDaemon({ userDataPath });
      const state = await waitForAnswer(daemon, session.id);
      expect(
        responses(state.messages).map((message) => message.content),
      ).toEqual(["Still here"]);
      expect(
        state.messages.filter((message) => message.role === "user"),
      ).toHaveLength(1);
      expect(state.messages.some((message) => message.role === "system")).toBe(
        false,
      );
      const lastRequest = stub.requests.at(-1);
      expect(JSON.stringify(lastRequest?.body.messages)).toContain(
        "Are you still there?",
      );
    } finally {
      await daemon.stop();
      await stub.close();
    }
  });

  it("continues a chat answer after a graceful daemon restart", async () => {
    const stub = await startStubLlmServer();
    const userDataPath = tempDirs.createSync("cocu-durable-");
    let daemon = await spawnDaemon({ userDataPath });
    try {
      const session = await startChatSession(daemon, stub);
      stub.plan = { kind: "hang" };
      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "Summarize our plan",
        },
        daemon.options,
      );
      await stub.nextRequest();
      await daemon.stop();

      stub.plan = { kind: "stream", chunks: ["The", " plan"] };
      daemon = await spawnDaemon({ userDataPath });
      const state = await waitForAnswer(daemon, session.id);
      expect(responses(state.messages).at(-1)?.content).toBe("The plan");
      expect(state.messages.some((message) => message.role === "system")).toBe(
        false,
      );
    } finally {
      await daemon.stop();
      await stub.close();
    }
  });

  it("never resumes another session's conversation from a recreated durable store", async () => {
    const stub = await startStubLlmServer();
    const userDataPath = tempDirs.createSync("cocu-durable-");
    let daemon = await spawnDaemon({ userDataPath });
    try {
      const first = await startChatSession(daemon, stub);
      const second = await startChatSession(daemon, stub);
      const ask = (sessionId: string, content: string) =>
        requestDaemon(
          "session.send",
          { sessionId, messageId: crypto.randomUUID(), content },
          daemon.options,
        );
      stub.plan = { kind: "stream", chunks: ["First answer"] };
      await ask(first.id, "First secret");
      await waitForAnswer(daemon, first.id);
      stub.plan = { kind: "stream", chunks: ["Second answer"] };
      await ask(second.id, "Second secret");
      await waitForAnswer(daemon, second.id);
      await daemon.stop();
      await rm(path.join(userDataPath, DURABLE_DATABASE_FILENAME), {
        force: true,
      });

      daemon = await spawnDaemon({ userDataPath });
      stub.plan = { kind: "stream", chunks: ["Second again"] };
      await ask(second.id, "Second follow-up");
      await waitForResponses(daemon, second.id, 2);
      stub.plan = { kind: "stream", chunks: ["First again"] };
      await ask(first.id, "First follow-up");
      const state = await waitForResponses(daemon, first.id, 2);

      expect(
        responses(state.messages).map((message) => message.content),
      ).toEqual(["First answer", "First again"]);
      const sent = JSON.stringify(stub.requests.at(-1)?.body.messages);
      expect(sent).toContain("First follow-up");
      expect(sent).not.toContain("Second");
    } finally {
      await daemon.stop();
      await stub.close();
    }
  });
});
