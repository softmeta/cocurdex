import type { AgentToolCallerContext } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { AgentToolInputError } from "./tool-input";
import { type AgentToolHandler, AgentToolRegistry } from "./tool-registry";

const mainCaller: AgentToolCallerContext = {
  sessionId: "s-main",
  sessionKind: "main",
  workspaceId: "w-1",
  teamId: null,
};

const subagentCaller: AgentToolCallerContext = {
  ...mainCaller,
  sessionId: "s-sub",
  sessionKind: "subagent",
};

function echoTool(): AgentToolHandler {
  return {
    descriptor: {
      group: "messaging",
      name: "echo",
      description: "Echo",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" }, count: { type: "integer" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => caller.sessionKind === "main",
    execute: async (caller, input) => ({ from: caller.sessionId, ...input }),
  };
}

describe("AgentToolRegistry", () => {
  it("exposes only tools available to the caller", () => {
    const registry = new AgentToolRegistry();
    registry.register(echoTool());
    expect(registry.catalog(mainCaller).tools.map((tool) => tool.name)).toEqual(
      ["echo"],
    );
    expect(registry.catalog(subagentCaller).tools).toEqual([]);
  });

  it("calls a tool by its full name with validated input", async () => {
    const registry = new AgentToolRegistry();
    registry.register(echoTool());
    await expect(
      registry.call(mainCaller, "messaging_echo", { text: "hi" }),
    ).resolves.toEqual({ from: "s-main", text: "hi" });
  });

  it("rejects unknown, unavailable, and malformed calls", async () => {
    const registry = new AgentToolRegistry();
    registry.register(echoTool());
    await expect(
      registry.call(mainCaller, "messaging_nope", {}),
    ).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
    await expect(
      registry.call(subagentCaller, "messaging_echo", { text: "hi" }),
    ).rejects.toMatchObject({ code: "TOOL_UNAVAILABLE" });
    await expect(
      registry.call(mainCaller, "messaging_echo", { count: 1 }),
    ).rejects.toBeInstanceOf(AgentToolInputError);
    await expect(
      registry.call(mainCaller, "messaging_echo", { text: "hi", count: 1.5 }),
    ).rejects.toBeInstanceOf(AgentToolInputError);
    await expect(
      registry.call(mainCaller, "messaging_echo", { text: "hi", extra: 1 }),
    ).rejects.toBeInstanceOf(AgentToolInputError);
  });

  it("refuses duplicate registrations", () => {
    const registry = new AgentToolRegistry();
    registry.register(echoTool());
    expect(() => registry.register(echoTool())).toThrow(/already registered/);
  });
});
