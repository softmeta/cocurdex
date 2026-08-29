import type { AgentEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createClaudeMessageMapper } from "./claude-message-mapper";

describe("createClaudeMessageMapper usage", () => {
  it("keeps assistant step usage out of absolute context snapshots", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
    });

    mapper.handleMessage({
      type: "assistant",
      message: {
        id: "message-1",
        model: "claude-haiku-4-5-20251001",
        content: [{ type: "text", text: "Done" }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 40,
        },
      },
    } as never);
    mapper.handleMessage({
      type: "result",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 40,
      },
      modelUsage: {
        "claude-haiku-4-5-20251001": {
          contextWindow: 200_000,
        },
      },
      total_cost_usd: 0.01,
    } as never);

    expect(events.filter((event) => event.type === "usage.updated")).toEqual([
      expect.objectContaining({
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheCreationInputTokens: 30,
          cacheReadInputTokens: 40,
          contextWindowSize: 200_000,
          totalCostUsd: 0.01,
        },
      }),
    ]);
  });

  it("emits session-only usage without settling the active turn", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
    });

    mapper.handleMessage(
      {
        type: "result",
        usage: { input_tokens: 900, output_tokens: 0 },
        uuid: "resume-result",
      } as never,
      { resultAttribution: "session-only" },
    );

    expect(events).toEqual([
      expect.objectContaining({
        attribution: "session-only",
        type: "usage.updated",
        usage: expect.objectContaining({ inputTokens: 900, outputTokens: 0 }),
      }),
    ]);
  });
});
