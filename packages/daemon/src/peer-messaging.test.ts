import {
  type MessageRecord,
  PEER_EXCHANGE_LIMIT,
  type PeerMessageEvent,
  type SendSessionCommand,
  type SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { PeerMessagingService } from "./peer-messaging";

function session(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: "s",
    workspaceId: "w-1",
    title: "Session",
    agentType: "codex",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: null,
    ...overrides,
  };
}

function harness(options: {
  sessions: SessionRecord[];
  activeTurns?: string[];
}) {
  const sent: SendSessionCommand[] = [];
  const events: PeerMessageEvent[] = [];
  const service = new PeerMessagingService({
    getSession: async (id) =>
      options.sessions.find((item) => item.id === id) ?? null,
    listSessions: async () => options.sessions,
    hasActiveTurn: (id) => options.activeTurns?.includes(id) ?? false,
    sendSessionMessage: async (command) => {
      sent.push(command);
      const message: MessageRecord = {
        id: `m-${sent.length}`,
        sessionId: command.sessionId,
        role: "user",
        content: command.content,
        attachments: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        ...(command.origin ? { origin: command.origin } : {}),
      };
      return message;
    },
    broadcast: (event) => events.push(event),
  });
  return { service, sent, events };
}

const alpha = session({ id: "a", title: "Alpha" });
const beta = session({ id: "b", title: "Beta" });

describe("PeerMessagingService", () => {
  it("lists reachable peers excluding the sender", async () => {
    const { service } = harness({
      sessions: [alpha, beta, session({ id: "c", sessionKind: "subagent" })],
    });
    const peers = await service.listPeers("a");
    expect(peers.map((peer) => peer.sessionId)).toEqual(["b"]);
  });

  it("delivers a new run with an origin envelope to an idle target", async () => {
    const { service, sent, events } = harness({ sessions: [alpha, beta] });
    const result = await service.send({
      fromSessionId: "a",
      toSessionId: "b",
      content: "hello",
    });
    expect(result).toEqual({ messageId: "m-1", delivery: "start-new-run" });
    expect(sent[0]).toMatchObject({
      sessionId: "b",
      delivery: "start-new-run",
      origin: { kind: "peer", sessionId: "a", sessionTitle: "Alpha" },
    });
    expect(sent[0]?.content).toContain('[Message from session "Alpha" (a)]');
    expect(events[0]).toMatchObject({
      type: "peer.message",
      delivery: "start-new-run",
    });
  });

  it("queues behind an active turn", async () => {
    const { service } = harness({
      sessions: [alpha, beta],
      activeTurns: ["b"],
    });
    const result = await service.send({
      fromSessionId: "a",
      toSessionId: "b",
      content: "hello",
    });
    expect(result.delivery).toBe("queue-after-run");
  });

  it("refuses when the target opted out", async () => {
    const { service, sent, events } = harness({
      sessions: [alpha, session({ id: "b", peerInbound: "refuse" })],
    });
    const result = await service.send({
      fromSessionId: "a",
      toSessionId: "b",
      content: "hello",
    });
    expect(result).toEqual({ messageId: null, delivery: "refused" });
    expect(sent).toEqual([]);
    expect(events[0]?.delivery).toBe("refused");
  });

  it("stops a ping-pong between two sessions at the exchange limit", async () => {
    const { service, sent } = harness({ sessions: [alpha, beta] });
    for (let index = 0; index < PEER_EXCHANGE_LIMIT; index += 1) {
      const [from, to] = index % 2 === 0 ? ["a", "b"] : ["b", "a"];
      await service.send({
        fromSessionId: from,
        toSessionId: to,
        content: "x",
      });
    }
    const result = await service.send({
      fromSessionId: "a",
      toSessionId: "b",
      content: "x",
    });
    expect(result).toEqual({ messageId: null, delivery: "loop_limit" });
    expect(sent).toHaveLength(PEER_EXCHANGE_LIMIT);
  });

  it("resets the exchange budget after human input to either session", async () => {
    const { service, sent } = harness({ sessions: [alpha, beta] });
    for (let index = 0; index < PEER_EXCHANGE_LIMIT; index += 1) {
      await service.send({
        fromSessionId: "a",
        toSessionId: "b",
        content: "x",
      });
    }
    service.noteHumanInput("b");
    const result = await service.send({
      fromSessionId: "a",
      toSessionId: "b",
      content: "x",
    });
    expect(result.delivery).toBe("start-new-run");
    expect(sent).toHaveLength(PEER_EXCHANGE_LIMIT + 1);
  });

  it("rejects unreachable targets", async () => {
    const { service } = harness({ sessions: [alpha] });
    await expect(
      service.send({ fromSessionId: "a", toSessionId: "a", content: "x" }),
    ).rejects.toThrow(/not reachable/);
  });
});
