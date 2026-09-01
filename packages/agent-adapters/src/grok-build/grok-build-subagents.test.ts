import type { AgentToolCallRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { grokBuildSubagentProtocol } from "./grok-build-subagents";

function toolCall(rawInput: unknown, rawOutput: unknown): AgentToolCallRecord {
  return {
    id: "tool-1",
    sessionId: "parent",
    title: "Subagent",
    kind: "other",
    status: "completed",
    content: [],
    rawInput,
    rawOutput,
    locations: [],
    startedAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:01.000Z",
  };
}

describe("grokBuildSubagentProtocol", () => {
  it("links a Task tool to the native child session", () => {
    expect(
      grokBuildSubagentProtocol.inspect(
        toolCall(
          {
            variant: "Task",
            description: "Review changes",
            subagent_type: "general-purpose",
          },
          {
            type: "Text",
            text: "Subagent started in background.\nsubagent_id: child-1",
          },
        ),
      ),
    ).toEqual({
      kind: "spawn",
      providerSessionId: "child-1",
      type: "general-purpose",
      description: "Review changes",
    });
  });

  it("reads the native child id from a completed foreground subagent", () => {
    expect(
      grokBuildSubagentProtocol.inspect(
        toolCall(
          {
            variant: "Task",
            description: "Review changes",
            subagent_type: "general-purpose",
          },
          {
            type: "SubagentCompleted",
            output: "Review complete",
            subagent_id: "child-1",
            subagent_type: "general-purpose",
          },
        ),
      ),
    ).toMatchObject({
      kind: "spawn",
      providerSessionId: "child-1",
      status: "completed",
    });
  });

  it("links a running subagent from the Grok extension notification", () => {
    expect(
      grokBuildSubagentProtocol.inspectNotification?.("x.ai/session/update", {
        sessionId: "parent",
        update: {
          sessionUpdate: "subagent_spawned",
          child_session_id: "child-1",
          subagent_type: "general-purpose",
          description: "[reviewer] local changes",
        },
      }),
    ).toEqual({
      providerSessionId: "child-1",
      type: "general-purpose",
      description: "[reviewer] local changes",
    });
  });

  it("settles a subagent from the Grok extension notification", () => {
    expect(
      grokBuildSubagentProtocol.inspectNotification?.("x.ai/session/update", {
        update: {
          sessionUpdate: "subagent_finished",
          child_session_id: "child-1",
          status: "completed",
        },
      }),
    ).toEqual({
      kind: "settlement",
      results: [{ providerSessionId: "child-1", status: "completed" }],
    });
  });

  it("unwraps child session updates carried by the Grok extension", () => {
    expect(
      grokBuildSubagentProtocol.mapSessionNotification?.(
        "x.ai/session/update",
        {
          sessionId: "child-1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Child output" },
          },
        },
      ),
    ).toEqual({
      sessionId: "child-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Child output" },
      },
    });
  });

  it("reads child turn completion from the Grok extension", () => {
    expect(
      grokBuildSubagentProtocol.readTurnCompletion?.("x.ai/session/update", {
        sessionId: "child-1",
        update: {
          sessionUpdate: "turn_completed",
          stop_reason: "end_turn",
          elapsed_ms: 1200,
        },
      }),
    ).toEqual({
      providerSessionId: "child-1",
      stopReason: "end_turn",
      durationMs: 1200,
    });
  });

  it("maps TaskOutput results onto child lifecycle settlement", () => {
    expect(
      grokBuildSubagentProtocol.inspect(
        toolCall(
          { variant: "TaskOutput" },
          {
            type: "TaskOutput",
            MultiResult: {
              results: [
                { task_id: "child-1", status: "completed" },
                { task_id: "child-2", status: "failed" },
              ],
            },
          },
        ),
      ),
    ).toEqual({
      kind: "settlement",
      results: [
        { providerSessionId: "child-1", status: "completed" },
        { providerSessionId: "child-2", status: "failed" },
      ],
    });
  });
});
