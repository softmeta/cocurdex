import type { AgentEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createCodexTurnStream } from "./codex-turn-stream";

function setup() {
  const events: AgentEvent[] = [];
  const stream = createCodexTurnStream({
    sessionId: "session-1",
    onEvent: (event) => events.push(event),
  });
  return { events, stream };
}

describe("createCodexTurnStream", () => {
  it("streams reasoning summary deltas as reasoning messages", () => {
    const { events, stream } = setup();

    stream.handleReasoningSummaryDelta({
      itemId: "item_r1",
      delta: "Thinking about",
      summaryIndex: 0,
    });
    stream.handleReasoningSummaryDelta({
      itemId: "item_r1",
      delta: " the fix",
      summaryIndex: 0,
    });
    stream.handleItem(
      { id: "item_r1", type: "reasoning", summary: [], content: [] },
      true,
    );

    expect(events).toMatchObject([
      { type: "message.delta", kind: "reasoning", delta: "Thinking about" },
      { type: "message.delta", kind: "reasoning", delta: " the fix" },
      {
        type: "message.completed",
        message: { kind: "reasoning", content: "Thinking about the fix" },
      },
    ]);
  });

  it("emits reasoning items that arrive without deltas", () => {
    const { events, stream } = setup();

    stream.handleItem(
      {
        id: "item_r2",
        type: "reasoning",
        summary: ["First part", "Second part"],
        content: [],
      },
      true,
    );

    expect(events).toMatchObject([
      {
        type: "message.completed",
        message: { kind: "reasoning", content: "First part\n\nSecond part" },
      },
    ]);
  });

  it("accumulates command output deltas into the active tool call", () => {
    const { events, stream } = setup();
    const item = {
      id: "item_c1",
      type: "commandExecution",
      command: "pnpm test",
      status: "inProgress",
      aggregatedOutput: null,
    } as const;

    stream.handleItem(item, false);
    stream.handleToolOutputDelta({ itemId: "item_c1", delta: "line 1\n" });
    stream.handleToolOutputDelta({ itemId: "item_c1", delta: "line 2\n" });
    stream.handleItem(
      { ...item, status: "completed", aggregatedOutput: "line 1\nline 2\n" },
      true,
    );

    expect(events).toMatchObject([
      { type: "tool.started", toolCall: { id: "item_c1", kind: "exec" } },
      { type: "tool.started", toolCall: { rawOutput: "line 1\n" } },
      { type: "tool.started", toolCall: { rawOutput: "line 1\nline 2\n" } },
      {
        type: "tool.finished",
        toolCall: { status: "completed", rawOutput: "line 1\nline 2\n" },
      },
    ]);
  });

  it("maps mcp and webSearch items to tool calls", () => {
    const { events, stream } = setup();

    stream.handleItem(
      {
        id: "item_m1",
        type: "mcpToolCall",
        server: "github",
        tool: "search_issues",
        status: "completed",
        arguments: { query: "bug" },
        result: { count: 2 },
        error: null,
      },
      true,
    );
    stream.handleItem(
      { id: "item_w1", type: "webSearch", query: "codex app-server" },
      false,
    );
    stream.handleItem(
      { id: "item_w1", type: "webSearch", query: "codex app-server" },
      true,
    );

    expect(events).toMatchObject([
      {
        type: "tool.finished",
        toolCall: { title: "github.search_issues", kind: "mcp" },
      },
      {
        type: "tool.started",
        toolCall: { kind: "search", status: "in_progress" },
      },
      {
        type: "tool.finished",
        toolCall: { kind: "search", status: "completed" },
      },
    ]);
  });

  it("emits response usage and the current context snapshot", () => {
    const { events, stream } = setup();

    stream.handleTokenUsage({
      tokenUsage: {
        total: {
          totalTokens: 1_300,
          inputTokens: 1_000,
          cachedInputTokens: 400,
          cacheWriteInputTokens: 80,
          outputTokens: 300,
          reasoningOutputTokens: 50,
        },
        last: {
          totalTokens: 130,
          inputTokens: 100,
          cachedInputTokens: 40,
          cacheWriteInputTokens: 8,
          outputTokens: 30,
          reasoningOutputTokens: 5,
        },
        modelContextWindow: 200_000,
      },
    });

    expect(events).toMatchObject([
      {
        type: "usage.updated",
        usage: {
          inputTokens: 100,
          outputTokens: 30,
          cacheReadInputTokens: 40,
          cacheCreationInputTokens: 8,
          reasoningOutputTokens: 5,
          contextTokensUsed: 130,
          contextWindowSize: 200_000,
        },
      },
    ]);
  });

  it("flushes in-flight messages on finishTurn", () => {
    const { events, stream } = setup();

    stream.handleAgentMessageDelta({ itemId: "item_a1", delta: "Partial " });
    stream.handleAgentMessageDelta({ itemId: "item_a1", delta: "answer" });
    stream.finishTurn();

    expect(events).toMatchObject([
      { type: "message.delta", kind: "response", delta: "Partial " },
      { type: "message.delta", kind: "response", delta: "answer" },
      {
        type: "message.completed",
        message: { kind: "response", content: "Partial answer" },
      },
    ]);
  });

  it("keeps interleaved assistant messages in separate records", () => {
    const { events, stream } = setup();

    stream.handleAgentMessageDelta({ itemId: "item_a1", delta: "I'll map " });
    stream.handleAgentMessageDelta({
      itemId: "item_a2",
      delta: "I'll inspect ",
    });
    stream.handleAgentMessageDelta({ itemId: "item_a1", delta: "the path." });
    stream.handleAgentMessageDelta({ itemId: "item_a2", delta: "the schema." });
    stream.finishTurn();

    const completed = events.flatMap((event) =>
      event.type === "message.completed"
        ? [{ id: event.message.id, content: event.message.content }]
        : [],
    );

    expect(completed).toEqual([
      { id: "item_a1", content: "I'll map the path." },
      { id: "item_a2", content: "I'll inspect the schema." },
    ]);
  });

  it("reports the completed message and last usage from finishTurn", () => {
    const { stream } = setup();

    stream.handleAgentMessageDelta({ itemId: "item_a2", delta: "Answer" });
    stream.handleTokenUsage({
      tokenUsage: { last: { inputTokens: 10, outputTokens: 4 } },
    });

    expect(stream.finishTurn()).toMatchObject({
      messageId: expect.any(String),
      usage: { inputTokens: 10, outputTokens: 4 },
    });
  });

  it("reports the assistant message that completed mid-turn", () => {
    const { stream } = setup();

    // The usual Codex path: the item completes before `turn/completed`, so at
    // finishTurn nothing is streaming any more.
    stream.handleItem(
      { id: "item_a3", type: "agentMessage", text: "Done" },
      true,
    );

    expect(stream.finishTurn().messageId).toBe("item_a3");
  });

  it("reports no message when the turn produced no assistant text", () => {
    const { stream } = setup();

    expect(stream.finishTurn()).toEqual({ messageId: null, usage: null });
  });
});
