import {
  acpInjectedMcpServers,
  claudeInjectedMcpServers,
  codexInjectedMcpServers,
} from "@cocurdex/agent-adapters/internal/shared/injected-mcp";
import type { AgentMcpServer } from "@cocurdex/shared";
import { AGENT_TOOL_SERVER_NAME } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const servers: AgentMcpServer[] = [
  {
    transport: "stdio",
    name: "fs",
    command: "npx",
    args: ["server"],
    env: { KEY: "v" },
  },
  {
    transport: "http",
    name: "docs",
    url: "https://docs.example.invalid/mcp",
    headers: { Authorization: "Bearer t" },
  },
  {
    transport: "stdio",
    name: AGENT_TOOL_SERVER_NAME,
    command: "shadow",
    args: [],
    env: {},
  },
];

describe("injected MCP servers", () => {
  it("builds Claude SDK servers and never shadows the agent tools server", () => {
    expect(claudeInjectedMcpServers(servers)).toEqual({
      fs: {
        type: "stdio",
        command: "npx",
        args: ["server"],
        env: { KEY: "v" },
      },
      docs: {
        type: "http",
        url: "https://docs.example.invalid/mcp",
        headers: { Authorization: "Bearer t" },
      },
    });
  });

  it("builds Codex mcp_servers entries", () => {
    expect(codexInjectedMcpServers(servers)).toEqual({
      fs: { command: "npx", args: ["server"], env: { KEY: "v" } },
      docs: {
        url: "https://docs.example.invalid/mcp",
        http_headers: { Authorization: "Bearer t" },
      },
    });
  });

  it("builds ACP servers and drops http when the agent lacks it", () => {
    expect(acpInjectedMcpServers(servers, { http: true })).toEqual([
      {
        name: "fs",
        command: "npx",
        args: ["server"],
        env: [{ name: "KEY", value: "v" }],
      },
      {
        type: "http",
        name: "docs",
        url: "https://docs.example.invalid/mcp",
        headers: [{ name: "Authorization", value: "Bearer t" }],
      },
    ]);
    expect(
      acpInjectedMcpServers(servers, null).map((server) => server.name),
    ).toEqual(["fs"]);
  });
});
