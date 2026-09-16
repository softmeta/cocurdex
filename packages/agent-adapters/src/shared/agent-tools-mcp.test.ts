import type { AgentToolsBinding } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  acpAgentToolsMcpServers,
  claudeAgentToolsMcpServers,
  codexAgentToolsThreadConfig,
} from "./agent-tools-mcp";

const binding: AgentToolsBinding = {
  token: "t",
  url: "http://127.0.0.1:4000/mcp",
};

describe("agent tools MCP configs", () => {
  it("produces nothing without a binding", () => {
    expect(claudeAgentToolsMcpServers(null)).toEqual({});
    expect(acpAgentToolsMcpServers(undefined, { http: true })).toEqual([]);
    expect(codexAgentToolsThreadConfig(null)).toEqual({});
  });

  it("carries the session token as a bearer header in each provider's shape", () => {
    expect(claudeAgentToolsMcpServers(binding)).toEqual({
      cocurdex: {
        type: "http",
        url: "http://127.0.0.1:4000/mcp",
        headers: { Authorization: "Bearer t" },
      },
    });
    expect(acpAgentToolsMcpServers(binding, { http: true })).toEqual([
      {
        type: "http",
        name: "cocurdex",
        url: "http://127.0.0.1:4000/mcp",
        headers: [{ name: "Authorization", value: "Bearer t" }],
      },
    ]);
    expect(codexAgentToolsThreadConfig(binding)).toEqual({
      config: {
        mcp_servers: {
          cocurdex: {
            url: "http://127.0.0.1:4000/mcp",
            http_headers: { Authorization: "Bearer t" },
          },
        },
      },
    });
  });

  it("skips ACP agents that do not advertise HTTP MCP support", () => {
    expect(acpAgentToolsMcpServers(binding, undefined)).toEqual([]);
    expect(acpAgentToolsMcpServers(binding, { http: false })).toEqual([]);
  });
});
