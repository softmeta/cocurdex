import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { getCachedTranscriptModel } from "@/features/agent/view/chat-transcript-model";

const NO_TOOL_CALLS: never[] = [];
const NO_QUESTIONS: never[] = [];

let sessionCounter = 0;

// The transcript cache is module-level; a fresh session id per test isolates
// cache entries between tests.
function nextSessionId() {
  sessionCounter += 1;
  return `session-${sessionCounter}`;
}

function message(
  id: string,
  role: MessageRecord["role"],
  content: string,
  createdAt: string,
  kind?: MessageRecord["kind"],
): MessageRecord {
  return {
    id,
    sessionId: "session",
    role,
    kind,
    content,
    attachments: [],
    createdAt,
  };
}

describe("getCachedTranscriptModel", () => {
  it("patches a multi-message streaming tail without rebuilding earlier groups", () => {
    const sessionId = nextSessionId();
    const oldPrompt = message("u0", "user", "first", "2026-06-25T00:00:00Z");
    const oldReply = message("a0", "assistant", "done", "2026-06-25T00:00:01Z");
    const prompt = message("u1", "user", "second", "2026-06-25T00:01:00Z");
    const reasoning = message(
      "r1",
      "assistant",
      "thinking",
      "2026-06-25T00:01:01Z",
      "reasoning",
    );
    const response = message(
      "a1",
      "assistant",
      "part",
      "2026-06-25T00:01:02Z",
      "response",
    );

    const first = getCachedTranscriptModel(
      sessionId,
      [oldPrompt, oldReply, prompt, reasoning, response],
      NO_TOOL_CALLS,
      NO_QUESTIONS,
    );

    // Reasoning and response both grew in the same flush (two new refs).
    const grownReasoning = { ...reasoning, content: "thinking more" };
    const grownResponse = { ...response, content: "partial answer" };
    const second = getCachedTranscriptModel(
      sessionId,
      [oldPrompt, oldReply, prompt, grownReasoning, grownResponse],
      NO_TOOL_CALLS,
      NO_QUESTIONS,
    );

    // Untouched groups keep their identity so memoized rows skip rendering.
    expect(second.timelineGroups[0]).toBe(first.timelineGroups[0]);
    expect(second.timelineGroups[1]).toBe(first.timelineGroups[1]);
    expect(second.timelineGroups[2]).toBe(first.timelineGroups[2]);
    expect(second.conversationGroups[0]).toBe(first.conversationGroups[0]);

    const lastGroups = second.timelineGroups.slice(-2);
    expect(
      lastGroups.map((group) =>
        group.kind === "message" ? group.message.content : null,
      ),
    ).toEqual(["thinking more", "partial answer"]);

    const lastConv = second.conversationGroups.at(-1);
    expect(lastConv?.prompt?.id).toBe("u1");
    expect(
      lastConv?.items.map((item) =>
        item.kind === "message" ? item.message.content : null,
      ),
    ).toEqual(["thinking more", "partial answer"]);
  });

  it("still patches when only the last message grows", () => {
    const sessionId = nextSessionId();
    const prompt = message("u1", "user", "hi", "2026-06-25T00:00:00Z");
    const reasoning = message(
      "r1",
      "assistant",
      "think",
      "2026-06-25T00:00:01Z",
      "reasoning",
    );
    const response = message(
      "a1",
      "assistant",
      "a",
      "2026-06-25T00:00:02Z",
      "response",
    );

    const first = getCachedTranscriptModel(
      sessionId,
      [prompt, reasoning, response],
      NO_TOOL_CALLS,
      NO_QUESTIONS,
    );
    const second = getCachedTranscriptModel(
      sessionId,
      [prompt, reasoning, { ...response, content: "ab" }],
      NO_TOOL_CALLS,
      NO_QUESTIONS,
    );

    expect(second.timelineGroups[1]).toBe(first.timelineGroups[1]);
    const last = second.timelineGroups.at(-1);
    expect(last?.kind === "message" ? last.message.content : null).toBe("ab");
  });

  it("rebuilds when a new message is appended", () => {
    const sessionId = nextSessionId();
    const prompt = message("u1", "user", "hi", "2026-06-25T00:00:00Z");
    const response = message(
      "a1",
      "assistant",
      "answer",
      "2026-06-25T00:00:01Z",
      "response",
    );

    getCachedTranscriptModel(sessionId, [prompt], NO_TOOL_CALLS, NO_QUESTIONS);
    const second = getCachedTranscriptModel(
      sessionId,
      [prompt, response],
      NO_TOOL_CALLS,
      NO_QUESTIONS,
    );

    expect(second.timelineGroups).toHaveLength(2);
    const lastConv = second.conversationGroups.at(-1);
    expect(lastConv?.prompt?.id).toBe("u1");
    expect(
      lastConv?.items.map((item) =>
        item.kind === "message" ? item.message.id : null,
      ),
    ).toEqual(["a1"]);
  });

  it("evicts the least recently used inactive session", () => {
    const firstMessages = [
      message("first", "user", "first", "2026-06-25T00:00:00Z"),
    ];
    const first = getCachedTranscriptModel(
      "lru-first",
      firstMessages,
      NO_TOOL_CALLS,
      NO_QUESTIONS,
    );

    for (let index = 0; index < 100; index += 1) {
      getCachedTranscriptModel(
        `lru-${index}`,
        [message(`m-${index}`, "user", "x", "2026-06-25T00:00:00Z")],
        NO_TOOL_CALLS,
        NO_QUESTIONS,
      );
    }

    const rebuilt = getCachedTranscriptModel(
      "lru-first",
      firstMessages,
      NO_TOOL_CALLS,
      NO_QUESTIONS,
    );
    expect(rebuilt).not.toBe(first);
  });
});
