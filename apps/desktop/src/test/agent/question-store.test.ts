import type { AgentEvent } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  applyQuestionEventAtom,
  questionsBySessionAtom,
} from "@/features/agent/question/question-store";

describe("question store", () => {
  it("tracks and answers plan questions for a session", () => {
    const store = createStore();
    const event: AgentEvent = {
      type: "question.requested",
      sessionId: "session-1",
      question: {
        id: "question-1",
        sessionId: "session-1",
        providerId: "codex",
        question: "Which file should I inspect?",
        status: "pending",
        answer: null,
        createdAt: "2026-05-02T12:00:00.000Z",
        updatedAt: "2026-05-02T12:00:00.000Z",
      },
    };

    store.set(applyQuestionEventAtom, event);
    store.set(applyQuestionEventAtom, {
      type: "question.resolved",
      sessionId: "session-1",
      question: {
        ...event.question,
        answer: "Use src/app.tsx",
        status: "answered",
        updatedAt: "2026-05-02T12:01:00.000Z",
      },
    });

    expect(store.get(questionsBySessionAtom)["session-1"]).toMatchObject([
      {
        answer: "Use src/app.tsx",
        status: "answered",
      },
    ]);
  });
});
