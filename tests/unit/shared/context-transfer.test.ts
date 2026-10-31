import {
  resolveStartContext,
  type StartContextRun,
} from "@cocurdex/shared/internal/context-transfer";
import type {
  AgentId,
  MessageRecord,
} from "@cocurdex/shared/internal/contracts";
import { describe, expect, it } from "vitest";

let clock = 0;

function message(
  id: string,
  role: MessageRecord["role"],
  content: string,
  runId: string | null = null,
  kind?: MessageRecord["kind"],
): MessageRecord {
  clock += 1;
  return {
    id,
    sessionId: "s1",
    role,
    content,
    attachments: [],
    createdAt: new Date(clock * 1000).toISOString(),
    runId,
    ...(kind ? { kind } : {}),
  };
}

function run(id: string, trigger: string, agentType: AgentId): StartContextRun {
  return { id, triggerMessageId: trigger, agentType };
}

function turn(index: number, agent: AgentId) {
  const runId = `r${index}`;
  return {
    run: run(runId, `u${index}`, agent),
    messages: [
      message(`u${index}`, "user", `question ${index}`),
      message(`a${index}`, "assistant", `answer ${index}`, runId),
    ],
  };
}

function history(...turns: ReturnType<typeof turn>[]) {
  return {
    priorMessages: turns.flatMap((item) => item.messages),
    runs: turns.map((item) => item.run),
  };
}

describe("resolveStartContext", () => {
  it("keeps native continuity when only the target agent worked", () => {
    const result = resolveStartContext({
      targetAgentType: "codex",
      ...history(turn(1, "codex"), turn(2, "codex")),
      hasProviderThread: true,
      pendingFork: false,
    });
    expect(result).toEqual({ kind: "native" });
  });

  it("hands the whole conversation to a new agent on a fresh thread", () => {
    const result = resolveStartContext({
      targetAgentType: "claude-agent",
      ...history(turn(1, "codex"), turn(2, "codex")),
      hasProviderThread: false,
      pendingFork: false,
    });
    expect(result).toMatchObject({
      kind: "handoff",
      transferKind: "agent_switch",
      strategy: "full",
      sourceAgentTypes: ["codex"],
      freshProviderThread: true,
    });
    expect(
      result.kind === "handoff" && result.messages.map((item) => item.id),
    ).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("hands only the unseen turns back to a returning agent", () => {
    const result = resolveStartContext({
      targetAgentType: "codex",
      ...history(turn(1, "codex"), turn(2, "claude-agent"), turn(3, "pi")),
      hasProviderThread: true,
      pendingFork: false,
    });
    expect(result).toMatchObject({
      kind: "handoff",
      strategy: "delta",
      sourceAgentTypes: ["claude-agent", "pi"],
      freshProviderThread: false,
    });
    expect(
      result.kind === "handoff" && result.messages.map((item) => item.id),
    ).toEqual(["u2", "a2", "u3", "a3"]);
  });

  it("leaves a lost thread without foreign turns to the adapter", () => {
    const result = resolveStartContext({
      targetAgentType: "codex",
      ...history(turn(1, "codex")),
      hasProviderThread: false,
      pendingFork: false,
    });
    expect(result).toEqual({ kind: "native" });
  });

  it("resolves a pending fork into a full handoff on a fresh thread", () => {
    const copied = [
      message("c1", "user", "explore"),
      message("c2", "assistant", "thinking", null, "reasoning"),
      message("c3", "assistant", "found it"),
    ];
    const result = resolveStartContext({
      targetAgentType: "codex",
      priorMessages: copied,
      runs: [],
      hasProviderThread: false,
      pendingFork: true,
    });
    expect(result).toMatchObject({
      kind: "handoff",
      transferKind: "fork",
      strategy: "full",
      freshProviderThread: true,
    });
    expect(
      result.kind === "handoff" && result.messages.map((item) => item.id),
    ).toEqual(["c1", "c3"]);
  });
});
