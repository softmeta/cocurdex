import type { AgentToolInvoker } from "@cocurdex/agent-core";
import { describe, expect, it, vi } from "vitest";
import { createPiAgentToolDefinitions } from "./pi-agent-tools";

function invoker(call: AgentToolInvoker["call"]): AgentToolInvoker {
  return {
    catalog: async () => ({
      caller: {
        sessionId: "s-1",
        sessionKind: "main",
        workspaceId: "w-1",
        teamId: null,
      },
      tools: [
        {
          group: "messaging",
          name: "send_message",
          description: "Send",
          inputSchema: {
            type: "object",
            properties: { to: { type: "string" } },
            required: ["to"],
          },
        },
      ],
    }),
    call,
  };
}

describe("createPiAgentToolDefinitions", () => {
  it("registers nothing without an invoker", async () => {
    expect(await createPiAgentToolDefinitions(null)).toEqual([]);
  });

  it("exposes catalog tools under their full name and forwards calls to the session invoker", async () => {
    const call = vi.fn(async () => ({ delivery: "start-new-run" }));
    const [tool] = await createPiAgentToolDefinitions(invoker(call));
    expect(tool?.name).toBe("messaging_send_message");
    expect(tool?.parameters).toMatchObject({ required: ["to"] });
    const result = await tool?.execute(
      "call-1",
      { to: "s-2" },
      undefined,
      undefined,
      {} as never,
    );
    expect(call).toHaveBeenCalledWith("messaging_send_message", { to: "s-2" });
    expect(result?.content).toEqual([
      { type: "text", text: '{\n  "delivery": "start-new-run"\n}' },
    ]);
  });

  it("surfaces daemon errors as tool failures", async () => {
    const [tool] = await createPiAgentToolDefinitions(
      invoker(async () => {
        throw new Error("Agent tool 'x' is not available to this session");
      }),
    );
    await expect(
      tool?.execute("call-1", { to: "s-2" }, undefined, undefined, {} as never),
    ).rejects.toThrow(/not available/);
  });
});
