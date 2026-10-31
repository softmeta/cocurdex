import {
  mcpServerAgents,
  toAgentMcpServer,
  withMcpServerAgents,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("mcpServerAgents", () => {
  it("defaults to Pi for servers written before agent targets existed", () => {
    expect(mcpServerAgents({ command: "x" })).toEqual(["pi"]);
  });

  it("reads and writes the Cocurdex agent list without touching Pi fields", () => {
    const config = withMcpServerAgents({ command: "x", enabled: false }, [
      "claude-agent",
      "codex",
      "claude-agent",
    ]);
    expect(config).toEqual({
      command: "x",
      enabled: false,
      cocurdex: { agents: ["claude-agent", "codex"] },
    });
    expect(mcpServerAgents(config)).toEqual(["claude-agent", "codex"]);
  });

  it("ignores malformed agent lists", () => {
    expect(mcpServerAgents({ cocurdex: { agents: "codex" } })).toEqual(["pi"]);
    expect(mcpServerAgents({ cocurdex: { agents: ["codex", 3] } })).toEqual([
      "codex",
    ]);
  });
});

describe("toAgentMcpServer", () => {
  const env = { TOKEN: "secret", HOME_DIR: "/home/example" };

  it("converts a stdio server and expands environment references", () => {
    expect(
      toAgentMcpServer(
        "fs",
        {
          command: "npx",
          args: ["-y", "server", "${HOME_DIR}"],
          env: { API_KEY: "$TOKEN", PRICE: "$$5" },
          exposure: "direct",
        },
        env,
      ),
    ).toEqual({
      server: {
        transport: "stdio",
        name: "fs",
        command: "npx",
        args: ["-y", "server", "${HOME_DIR}"],
        env: { API_KEY: "secret", PRICE: "$5" },
      },
    });
  });

  it("converts an http server and expands header references", () => {
    expect(
      toAgentMcpServer(
        "docs",
        {
          url: "https://docs.example.invalid/mcp",
          headers: { Authorization: "Bearer ${TOKEN}" },
        },
        env,
      ),
    ).toEqual({
      server: {
        transport: "http",
        name: "docs",
        url: "https://docs.example.invalid/mcp",
        headers: { Authorization: "Bearer secret" },
      },
    });
  });

  it("reports Pi-only features instead of passing them on", () => {
    expect(
      toAgentMcpServer("a", { command: "x", env: { K: "!op read" } }, env),
    ).toEqual({ unsupported: "command-value" });
    expect(
      toAgentMcpServer(
        "b",
        { url: "https://b.example.invalid", auth: { provider: "x" } },
        env,
      ),
    ).toEqual({ unsupported: "provider-auth" });
    expect(toAgentMcpServer("c", { command: "x", cwd: "tools" }, env)).toEqual({
      unsupported: "cwd",
    });
    expect(
      toAgentMcpServer(
        "d",
        { url: "https://d.example.invalid", headers: { X: "${MISSING}" } },
        env,
      ),
    ).toEqual({ unsupported: "missing-env" });
    expect(toAgentMcpServer("e", { foo: 1 }, env)).toEqual({
      unsupported: "invalid",
    });
  });
});
