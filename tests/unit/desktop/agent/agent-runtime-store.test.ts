import type {
  AgentEvent,
  AgentProviderRuntimeSnapshot,
} from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  agentRuntimeBySessionAtom,
  applyAgentRuntimeEventAtom,
} from "@/features/agent/runtime/agent-runtime-store";

describe("agent runtime store", () => {
  it("keeps the latest ACP commands, mode, config, and capabilities by session", () => {
    const store = createStore();
    const sessionId = "session-1";
    const capabilities = {
      protocol: { kind: "acp" as const, version: 1 },
      loadSession: true,
      resumeSession: true,
      prompt: {
        audio: false,
        embeddedContext: true,
        image: true,
      },
    };
    const commands = [
      {
        name: "review",
        description: "Review the workspace",
        source: "agent" as const,
      },
    ];
    const availableModes = [
      { id: "default", name: "Default" },
      { id: "plan", name: "Plan" },
    ];
    const configOptions = [
      {
        id: "model",
        name: "Model",
        type: "select" as const,
        currentValue: "grok-code",
        options: [{ value: "grok-code", name: "Grok Code" }],
      },
    ];
    const runtime = {
      apiKeySource: "oauth",
      capabilities: ["interrupt_receipt_v1"],
      cwd: "/tmp/repo",
      fastModeState: "off",
      mcpServers: [{ name: "filesystem", status: "connected" }],
      model: "claude-opus-4-6",
      providerId: "claude-agent",
      runtimeVersion: "2.1.220",
      skills: ["review"],
      tools: ["Read"],
    } satisfies AgentProviderRuntimeSnapshot;
    const events: AgentEvent[] = [
      {
        type: "capabilities.updated",
        sessionId,
        capabilities,
      },
      {
        type: "commands.updated",
        sessionId,
        commands,
      },
      {
        type: "provider.runtime.updated",
        sessionId,
        receivedAt: "2026-08-04T00:00:00.000Z",
        runtime,
      },
      {
        type: "session.mode.updated",
        sessionId,
        currentModeId: "plan",
        availableModes,
      },
      {
        type: "session.config.updated",
        sessionId,
        configOptions,
      },
    ];

    for (const event of events) {
      store.set(applyAgentRuntimeEventAtom, event);
    }

    expect(store.get(agentRuntimeBySessionAtom)[sessionId]).toEqual({
      capabilities,
      commands,
      mode: {
        currentModeId: "plan",
        availableModes,
      },
      configOptions,
      runtime,
    });
  });
});
