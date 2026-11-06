import { createPiRunPolicy } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-run-policy";
import type { AgentRunPolicy } from "@cocurdex/agent-core";
import { describe, expect, it } from "vitest";

type Handler = (event: Record<string, unknown>) => unknown;

function loadPolicy() {
  const handlers = new Map<string, Handler>();
  let activeTools = ["read", "write", "bash", "routine_report"];
  const policy = createPiRunPolicy();
  const extension = policy.extension as { factory(pi: never): void };
  extension.factory({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    getActiveTools: () => activeTools,
    setActiveTools: (names: string[]) => {
      activeTools = names;
    },
  } as never);
  const emit = (name: string, event: Record<string, unknown>) =>
    handlers.get(name)?.(event);
  const startRun = () => {
    const event = { systemPromptOptions: { selectedTools: undefined } };
    emit("before_agent_start", event);
    return event.systemPromptOptions.selectedTools as string[] | undefined;
  };
  return {
    policy,
    emit,
    startRun,
    activeTools: () => activeTools,
  };
}

const readOnly: AgentRunPolicy = {
  allowedTools: ["read", "routine_report"],
  blockedToolReason: "Not in this run",
  requiredTool: { name: "routine_report", reminder: "Report now" },
};

describe("pi run policy", () => {
  it("limits a run to its allowed tools and restores them once the policy ends", () => {
    const { policy, emit, startRun, activeTools } = loadPolicy();
    policy.set(readOnly);

    expect(startRun()).toEqual(["read", "routine_report"]);
    expect(emit("tool_call", { toolName: "bash" })).toEqual({
      block: true,
      reason: "Not in this run",
    });
    expect(emit("tool_call", { toolName: "read" })).toBeUndefined();

    policy.set(null);
    expect(startRun()).toBeUndefined();
    expect(activeTools()).toEqual(["read", "write", "bash", "routine_report"]);
    expect(emit("tool_call", { toolName: "bash" })).toBeUndefined();
  });

  it("reminds a completed run once when the required tool was not called", () => {
    const { policy, emit } = loadPolicy();
    policy.set(readOnly);

    const reminder = emit("agent_before_settle", { outcome: "completed" });
    expect(reminder).toMatchObject({
      continue: true,
      entries: [{ type: "custom_message", content: "Report now" }],
    });
    expect(
      emit("agent_before_settle", { outcome: "completed" }),
    ).toBeUndefined();

    policy.set(readOnly);
    emit("tool_execution_end", { toolName: "routine_report", isError: false });
    expect(
      emit("agent_before_settle", { outcome: "completed" }),
    ).toBeUndefined();
  });
});
