import type { MessageRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { messagesBySessionAtom } from "../view/message-store";
import {
  appendQueuedInputAtom,
  discardQueuedInputAtom,
  queuedInputsBySessionAtom,
} from "./queued-input-store";

function message(id: string, content: string): MessageRecord {
  return {
    id,
    sessionId: "session-1",
    role: "user",
    content,
    attachments: [],
    createdAt: "2026-09-30T00:00:00.000Z",
  };
}

describe("discardQueuedInputAtom", () => {
  it("removes a discarded queued message from the timeline messages", () => {
    const store = createStore();
    const sent = message("sent", "Sent");
    const queued = message("queued", "Queued");
    store.set(messagesBySessionAtom, { "session-1": [sent, queued] });
    store.set(appendQueuedInputAtom, {
      messageId: queued.id,
      sessionId: queued.sessionId,
      workspaceRootPath: "/tmp/repo",
      createdAt: queued.createdAt,
      message: queued,
    });

    store.set(discardQueuedInputAtom, {
      sessionId: queued.sessionId,
      messageId: queued.id,
    });

    expect(store.get(queuedInputsBySessionAtom)).toEqual({});
    expect(store.get(messagesBySessionAtom)["session-1"]).toEqual([sent]);
  });
});
