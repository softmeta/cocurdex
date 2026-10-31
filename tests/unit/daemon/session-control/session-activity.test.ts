import {
  readSessionActivity,
  type SessionActivityReader,
} from "@cocurdex/daemon/internal/session-control/session-activity";
import type {
  AgentToolCallRecord,
  ContextTransferRecord,
  MessageRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function message(sessionId: string, id: string, seq: number): MessageRecord {
  return {
    id,
    sessionId,
    role: seq % 2 ? "user" : "assistant",
    content: id,
    attachments: [],
    createdAt: new Date(seq * 1000).toISOString(),
    seq,
  };
}

function command(
  sessionId: string,
  id: string,
  seq: number,
): AgentToolCallRecord {
  return {
    id,
    sessionId,
    title: id,
    kind: "exec",
    status: "completed",
    content: [],
    locations: [],
    startedAt: new Date(seq * 1000).toISOString(),
    updatedAt: new Date(seq * 1000).toISOString(),
    seq,
  };
}

const forkTransfer = {
  kind: "fork",
  sourceSessionId: "origin",
  sourceMessageId: "o2",
} as ContextTransferRecord;

const reader: SessionActivityReader = {
  listMessages: async (sessionId) =>
    sessionId === "origin"
      ? [
          message("origin", "o1", 1),
          message("origin", "o2", 2),
          message("origin", "o5", 5),
        ]
      : [message("fork", "f1", 1)],
  listToolCalls: async (sessionId) =>
    sessionId === "origin"
      ? [
          command("origin", "before-fork", 3),
          command("origin", "after-fork", 6),
        ]
      : [],
  listRuns: () => [],
  listTransfers: (sessionId) => (sessionId === "fork" ? [forkTransfer] : []),
};

describe("readSessionActivity", () => {
  it("lets a fork read its source session only up to the fork point", async () => {
    const items = await readSessionActivity(reader, "fork", "origin");
    expect(items.map((entry) => entry.id)).toEqual(["o1", "o2", "before-fork"]);
  });

  it("refuses sessions outside the fork lineage", async () => {
    await expect(readSessionActivity(reader, "origin", "fork")).rejects.toThrow(
      "not this session",
    );
  });

  it("orders a session's messages and commands by timeline position", async () => {
    const items = await readSessionActivity(reader, "origin", "origin");
    expect(items.map((entry) => entry.id)).toEqual([
      "o1",
      "o2",
      "before-fork",
      "o5",
      "after-fork",
    ]);
  });
});
