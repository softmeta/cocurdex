import type { MessageRecord, QueuedAgentInputRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  appendQueuedInputAtom,
  applyQueuedInputEventAtom,
  bootstrapQueuedInputsAtom,
  queuedInputsBySessionAtom,
} from "@/features/agent/queued-input/queued-input-store";

const message: MessageRecord = {
  id: "message-1",
  sessionId: "session-1",
  role: "user",
  content: "Queued follow-up",
  attachments: [],
  createdAt: "2026-08-02T04:00:00.000Z",
};

const input: QueuedAgentInputRecord = {
  messageId: message.id,
  sessionId: message.sessionId,
  workspaceRootPath: "/workspace",
  createdAt: message.createdAt,
};

describe("queued input store", () => {
  it("hydrates durable queue metadata with its persisted message", () => {
    const store = createStore();

    store.set(bootstrapQueuedInputsAtom, {
      inputs: [input],
      messages: [message],
    });

    expect(store.get(queuedInputsBySessionAtom)).toEqual({
      "session-1": [{ ...input, message }],
    });
  });

  it("removes an input only when its user message starts the turn", () => {
    const store = createStore();
    store.set(bootstrapQueuedInputsAtom, {
      inputs: [input],
      messages: [message],
    });

    store.set(applyQueuedInputEventAtom, {
      type: "message.completed",
      sessionId: message.sessionId,
      message: { ...message, role: "assistant" },
    });
    expect(
      store.get(queuedInputsBySessionAtom)[message.sessionId],
    ).toHaveLength(1);

    store.set(applyQueuedInputEventAtom, {
      type: "message.completed",
      sessionId: message.sessionId,
      message,
    });
    expect(store.get(queuedInputsBySessionAtom)).toEqual({});
  });

  it("does not resurrect a queued input when completion beats the IPC reply", () => {
    const store = createStore();

    store.set(applyQueuedInputEventAtom, {
      type: "message.completed",
      sessionId: message.sessionId,
      message,
    });
    store.set(appendQueuedInputAtom, { ...input, message });
    store.set(bootstrapQueuedInputsAtom, {
      inputs: [input],
      messages: [message],
    });

    expect(store.get(queuedInputsBySessionAtom)).toEqual({});
  });
});
