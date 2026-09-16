import type { AgentToolsBinding } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  acpAgentToolsMcpServers,
  claudeAgentToolsMcpServers,
  codexAgentToolsThreadConfig,
} from "./agent-tools-mcp";

const binding: AgentToolsBinding = {
  token: "t",
  stdio: {
    command: "/usr/bin/node",
    args: ["/app/daemon.cjs", "agent-tools"],
    env: { COCURDEX_AGENT_TOKEN: "t", COCURDEX_USER_DATA_PATH: "/data" },
  },
};

describe("agent tools MCP configs", () => {
  it("produces nothing without a binding", () => {
    expect(claudeAgentToolsMcpServers(null)).toEqual({});
    expect(acpAgentToolsMcpServers(undefined)).toEqual([]);
    expect(codexAgentToolsThreadConfig(null)).toEqual({});
  });

  it("maps the stdio spec into each provider's shape", () => {
    expect(claudeAgentToolsMcpServers(binding)).toEqual({
      cocurdex: {
        type: "stdio",
        command: "/usr/bin/node",
        args: ["/app/daemon.cjs", "agent-tools"],
        env: { COCURDEX_AGENT_TOKEN: "t", COCURDEX_USER_DATA_PATH: "/data" },
      },
    });
    expect(acpAgentToolsMcpServers(binding)).toEqual([
      {
        name: "cocurdex",
        command: "/usr/bin/node",
        args: ["/app/daemon.cjs", "agent-tools"],
        env: [
          { name: "COCURDEX_AGENT_TOKEN", value: "t" },
          { name: "COCURDEX_USER_DATA_PATH", value: "/data" },
        ],
      },
    ]);
    expect(codexAgentToolsThreadConfig(binding)).toEqual({
      config: {
        mcp_servers: {
          cocurdex: {
            command: "/usr/bin/node",
            args: ["/app/daemon.cjs", "agent-tools"],
            env: {
              COCURDEX_AGENT_TOKEN: "t",
              COCURDEX_USER_DATA_PATH: "/data",
            },
          },
        },
      },
    });
  });
});
