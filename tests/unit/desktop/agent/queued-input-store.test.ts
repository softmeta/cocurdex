import type { MessageRecord, QueuedAgentInputRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  appendQueuedInputAtom,
  applyQueuedInputEventAtom,
  bootstrapQueuedInputsAtom,
  markQueueResumedAtom,
  pausedQueueSessionIdsAtom,
  queuedInputsBySessionAtom,
  removeQueuedInputAtom,
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
      pausedSessionIds: [],
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
      pausedSessionIds: [],
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
      pausedSessionIds: [],
    });

    expect(store.get(queuedInputsBySessionAtom)).toEqual({});
  });

  it("keeps a restored queue paused until its last input leaves", () => {
    const store = createStore();
    const second = { ...message, id: "message-2" };
    store.set(bootstrapQueuedInputsAtom, {
      inputs: [input, { ...input, messageId: second.id }],
      messages: [message, second],
      pausedSessionIds: [message.sessionId],
    });
    expect(store.get(pausedQueueSessionIdsAtom).has(message.sessionId)).toBe(
      true,
    );

    store.set(removeQueuedInputAtom, {
      sessionId: message.sessionId,
      messageId: message.id,
    });
    expect(store.get(pausedQueueSessionIdsAtom).has(message.sessionId)).toBe(
      true,
    );

    store.set(removeQueuedInputAtom, {
      sessionId: message.sessionId,
      messageId: second.id,
    });
    expect(store.get(pausedQueueSessionIdsAtom).size).toBe(0);
  });

  it("forgets the paused state once the queue is resumed", () => {
    const store = createStore();
    store.set(bootstrapQueuedInputsAtom, {
      inputs: [input],
      messages: [message],
      pausedSessionIds: [message.sessionId],
    });

    store.set(markQueueResumedAtom, message.sessionId);

    expect(store.get(pausedQueueSessionIdsAtom).size).toBe(0);
    expect(
      store.get(queuedInputsBySessionAtom)[message.sessionId],
    ).toHaveLength(1);
  });
});
