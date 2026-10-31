import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import type { CocurdexDaemonEvent, MessageRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { startChatSession } from "@cocurdex/test-harness/helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type StubLlmServer,
  startStubLlmServer,
} from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

async function sendAndWait(
  daemon: DaemonProcess,
  sessionId: string,
  content: string,
) {
  const events: CocurdexDaemonEvent[] = [];
  const subscription = await subscribeDaemonEvents(
    (event) => events.push(event),
    daemon.options,
  );
  try {
    await requestDaemon(
      "session.send",
      { sessionId, messageId: crypto.randomUUID(), content },
      daemon.options,
    );
    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "message.completed" &&
          event.sessionId === sessionId &&
          event.message.role === "assistant" &&
          event.message.kind === "response",
      ),
    );
    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "state.changed" &&
          event.sessionId === sessionId &&
          event.status === "idle",
      ),
    );
  } finally {
    subscription.close();
  }
}

function contents(messages: MessageRecord[]) {
  return messages.map((message) => `${message.role}:${message.content}`);
}

async function pull(
  daemon: DaemonProcess,
  sessionId: string,
  cursor: string | null,
) {
  return requestDaemon(
    "sync.pull",
    { sessionIds: [sessionId], hydratedSessionIds: [sessionId], cursor },
    daemon.options,
  );
}

async function withStub(run: (stub: StubLlmServer) => Promise<void>) {
  const stub = await startStubLlmServer();
  try {
    await run(stub);
  } finally {
    await stub.close();
  }
}

describe("sync.pull across daemon restarts", () => {
  it("catches a client up with only the changes since its cursor", async () => {
    await withStub(async (stub) => {
      const userDataPath = tempDirs.createSync("cocu-sync-");
      const first = await spawnDaemon({ userDataPath });
      const session = await startChatSession(first, stub);
      const discarded = await startChatSession(first, stub);
      stub.plan = { kind: "stream", chunks: ["first", " answer"] };
      await sendAndWait(first, session.id, "first question");

      const initial = await pull(first, session.id, null);
      expect(initial.mode).toBe("full");
      expect(initial.transcripts[session.id]?.complete).toBe(true);
      expect(contents(initial.transcripts[session.id]?.messages ?? [])).toEqual(
        expect.arrayContaining([
          "user:first question",
          "assistant:first answer",
        ]),
      );
      expect(await first.stop()).toBe(0);

      const second = await spawnDaemon({ userDataPath });
      try {
        const longAnswer = Array.from(
          { length: 400 },
          (_, index) => `w${index} `,
        );
        stub.plan = { kind: "stream", chunks: longAnswer };
        await sendAndWait(second, session.id, "second question");
        await requestDaemon(
          "session.delete",
          { sessionId: discarded.id },
          second.options,
        );

        const delta = await pull(second, session.id, initial.cursor);
        expect(delta.mode).toBe("delta");
        expect(delta.removedSessionIds).toEqual([discarded.id]);
        const transcript = delta.transcripts[session.id];
        expect(transcript?.complete).toBe(false);
        expect(contents(transcript?.messages ?? [])).toEqual([
          "user:second question",
          `assistant:${longAnswer.join("")}`,
        ]);

        const unchanged = await pull(second, session.id, delta.cursor);
        expect(unchanged.mode).toBe("delta");
        expect(unchanged.sessions).toEqual([]);
        expect(unchanged.transcripts[session.id]?.messages).toEqual([]);
      } finally {
        await second.stop();
      }
    });
  });

  it("falls back to a full pull for a cursor from another database", async () => {
    await withStub(async (stub) => {
      const daemon = await spawnDaemon({
        userDataPath: tempDirs.createSync("cocu-sync-"),
      });
      try {
        const session = await startChatSession(daemon, stub);
        const result = await pull(daemon, session.id, `v1.${"0".repeat(32)}.1`);
        expect(result.mode).toBe("full");
        expect(result.transcripts[session.id]?.complete).toBe(true);
      } finally {
        await daemon.stop();
      }
    });
  });

  it("keeps a reply that was streaming when the daemon stopped", async () => {
    await withStub(async (stub) => {
      const userDataPath = tempDirs.createSync("cocu-sync-");
      const first = await spawnDaemon({ userDataPath });
      const session = await startChatSession(first, stub);
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        first.options,
      );
      stub.plan = {
        kind: "stream",
        chunks: Array.from({ length: 200 }, (_, index) => `c${index} `),
        intervalMs: 50,
      };
      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "go",
        },
        first.options,
      );
      await waitFor(
        () =>
          events.filter((event) => event.type === "message.delta").length > 40,
      );
      subscription.close();
      await first.stop();

      const second = await spawnDaemon({ userDataPath });
      try {
        const result = await pull(second, session.id, null);
        const reply = result.transcripts[session.id]?.messages.find(
          (message) => message.role === "assistant",
        );
        expect(reply?.content.startsWith("c0 c1 c2 ")).toBe(true);
        const transcript = result.transcripts[session.id]?.messages ?? [];
        expect(transcript.at(-1)).toMatchObject({
          role: "system",
          content: expect.stringContaining("Cocurdex restarted"),
        });
        expect(
          result.sessions.find((entry) => entry.id === session.id)?.status,
        ).toBe("idle");
      } finally {
        await second.stop();
      }
    });
  });

  it("announces a prompt that starts a turn so observers pull it", async () => {
    await withStub(async (stub) => {
      const daemon = await spawnDaemon({
        userDataPath: tempDirs.createSync("cocu-sync-"),
      });
      try {
        const session = await startChatSession(daemon, stub);
        const before = await pull(daemon, session.id, null);
        const events: CocurdexDaemonEvent[] = [];
        const subscription = await subscribeDaemonEvents(
          (event) => events.push(event),
          daemon.options,
        );
        try {
          stub.plan = { kind: "hang" };
          await requestDaemon(
            "session.send",
            {
              sessionId: session.id,
              messageId: crypto.randomUUID(),
              content: "observed prompt",
            },
            daemon.options,
          );
          await waitFor(() =>
            events.some(
              (event) =>
                event.type === "data.changed" && event.areas.includes("agent"),
            ),
          );
          const delta = await pull(daemon, session.id, before.cursor);
          expect(
            contents(delta.transcripts[session.id]?.messages ?? []),
          ).toEqual(["user:observed prompt"]);
        } finally {
          subscription.close();
          await requestDaemon(
            "session.stop",
            { sessionId: session.id },
            daemon.options,
          );
        }
      } finally {
        await daemon.dispose();
      }
    });
  });
});
