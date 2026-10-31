import {
  applySessionRuntimeEvent,
  EMPTY_AGENT_SESSION_RUNTIME_STATE,
  isSessionRuntimeEvent,
  seedSessionRuntimeState,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("applySessionRuntimeEvent", () => {
  it("records live config options and MCP servers", () => {
    const withConfig = applySessionRuntimeEvent(
      EMPTY_AGENT_SESSION_RUNTIME_STATE,
      {
        type: "session.config.updated",
        sessionId: "s1",
        configOptions: [
          { id: "plan", name: "Plan", type: "boolean", currentValue: true },
        ],
      },
    );
    const withRuntime = applySessionRuntimeEvent(withConfig, {
      type: "provider.runtime.updated",
      sessionId: "s1",
      receivedAt: "2026-10-27T00:00:00.000Z",
      runtime: {
        providerId: "claude-agent",
        capabilities: [],
        cwd: "/w",
        mcpServers: [{ name: "github", status: "connected" }],
        model: "opus",
        runtimeVersion: "1",
        skills: [],
        tools: [],
      },
    });

    expect(withRuntime.configOptions.map((option) => option.id)).toEqual([
      "plan",
    ]);
    expect(withRuntime.runtime?.mcpServers).toEqual([
      { name: "github", status: "connected" },
    ]);
  });

  it("keeps the known modes when a mode update omits them", () => {
    const first = applySessionRuntimeEvent(EMPTY_AGENT_SESSION_RUNTIME_STATE, {
      type: "session.mode.updated",
      sessionId: "s1",
      currentModeId: "code",
      availableModes: [
        { id: "code", name: "Code" },
        { id: "ask", name: "Ask" },
      ],
    });
    const next = applySessionRuntimeEvent(first, {
      type: "session.mode.updated",
      sessionId: "s1",
      currentModeId: "ask",
    });

    expect(next.mode).toEqual({
      currentModeId: "ask",
      availableModes: [
        { id: "code", name: "Code" },
        { id: "ask", name: "Ask" },
      ],
    });
  });

  it("recognizes only runtime events", () => {
    expect(
      isSessionRuntimeEvent({ type: "session.config.updated" }),
    ).toBeTruthy();
    expect(isSessionRuntimeEvent({ type: "message.delta" })).toBeFalsy();
  });
});

describe("seedSessionRuntimeState", () => {
  const seeded = {
    ...EMPTY_AGENT_SESSION_RUNTIME_STATE,
    configOptions: [
      {
        id: "plan",
        name: "Plan",
        type: "boolean" as const,
        currentValue: false,
      },
    ],
    mode: { availableModes: [], currentModeId: "default" },
  };

  it("adopts the daemon's state when nothing was reported live", () => {
    expect(seedSessionRuntimeState(undefined, seeded)).toEqual(seeded);
  });

  it("keeps what the agent reported live and fills the rest from the daemon", () => {
    const live = applySessionRuntimeEvent(EMPTY_AGENT_SESSION_RUNTIME_STATE, {
      type: "session.mode.updated",
      sessionId: "s1",
      currentModeId: "plan",
    });
    expect(seedSessionRuntimeState(live, seeded)).toEqual({
      ...seeded,
      mode: { availableModes: [], currentModeId: "plan" },
    });
  });
});
