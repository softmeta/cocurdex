import type {
  AgentEvent,
  MessageRecord,
  SessionObservationSnapshot,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { applySessionEvent, createSessionTuiState } from "./session-tui-model";

const createdAt = "2026-08-09T00:00:00.000Z";

function createSession(): SessionRecord {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Session",
    agentType: "codex",
    status: "idle",
    writeMode: "read-only",
    collaborationMode: "default",
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: null,
  };
}

function message(
  id: string,
  content: string,
  overrides: Partial<MessageRecord> = {},
): MessageRecord {
  return {
    id,
    sessionId: "session-1",
    role: "assistant",
    content,
    attachments: [],
    createdAt,
    ...overrides,
  };
}

function createSnapshot(): SessionObservationSnapshot {
  return {
    session: createSession(),
    messages: [message("user-1", "Hello", { role: "user" })],
    activeMessages: [message("assistant-1", "Par")],
    toolCalls: [],
    queuedAgentInputs: [],
    turnChangeSets: {},
    usage: null,
    interactions: {
      permissions: [],
      questions: [],
      planApprovals: [],
    },
  };
}

describe("session TUI projection", () => {
  it("hydrates durable history and live buffered output", () => {
    const state = createSessionTuiState(createSnapshot());

    expect(state.messages.map(({ id, content }) => ({ id, content }))).toEqual([
      { id: "user-1", content: "Hello" },
      { id: "assistant-1", content: "Par" },
    ]);
  });

  it("merges deltas and lets a completed message replace the live projection", () => {
    const initial = createSessionTuiState(createSnapshot());
    const withDelta = applySessionEvent(initial, {
      type: "message.delta",
      sessionId: "session-1",
      messageId: "assistant-1",
      role: "assistant",
      kind: "response",
      delta: "tial",
      createdAt,
    });
    const completed = applySessionEvent(withDelta, {
      type: "message.completed",
      sessionId: "session-1",
      message: message("assistant-1", "Partial answer"),
    });

    expect(withDelta.messages.at(-1)?.content).toBe("Partial");
    expect(completed.messages.at(-1)?.content).toBe("Partial answer");
  });

  it("tracks current interactions and ignores events for other sessions", () => {
    const initial = createSessionTuiState(createSnapshot());
    const requested: AgentEvent = {
      type: "permission.requested",
      sessionId: "session-1",
      request: {
        id: "permission-1",
        sessionId: "session-1",
        providerId: "codex",
        kind: "command",
        title: "Run tests",
        locations: [],
        options: [{ id: "allow", kind: "allow_once", label: "Allow once" }],
        status: "pending",
        createdAt,
        updatedAt: createdAt,
      },
    };

    const pending = applySessionEvent(initial, requested);
    const ignored = applySessionEvent(pending, {
      ...requested,
      sessionId: "session-2",
      request: { ...requested.request, sessionId: "session-2" },
    });
    const resolved = applySessionEvent(ignored, {
      type: "permission.resolved",
      sessionId: "session-1",
      request: { ...requested.request, status: "allowed" },
      decision: "allow_once",
    });

    expect(pending.interactions.permissions).toHaveLength(1);
    expect(ignored).toBe(pending);
    expect(resolved.interactions.permissions).toEqual([]);
  });
});
