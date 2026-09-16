import http from "node:http";
import type { AddressInfo } from "node:net";
import type { AgentToolCatalog } from "@cocurdex/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AgentToolHttpBridge,
  createAgentToolHttpHandler,
  isAgentToolHttpRequest,
} from "./http-server";

const servers: http.Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

function catalogFor(sessionId: string): AgentToolCatalog {
  return {
    caller: {
      sessionId,
      sessionKind: "main",
      workspaceId: "w-1",
      teamId: null,
    },
    tools: [
      {
        group: "messaging",
        name: "list_agents",
        description: `List peers of ${sessionId}`,
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
}

const sessionsByToken = new Map([
  ["token-a", "s-a"],
  ["token-b", "s-b"],
]);

const bridge: AgentToolHttpBridge = {
  async catalog(token) {
    const sessionId = sessionsByToken.get(token);
    if (!sessionId) throw new Error("Agent tool token is not valid");
    return catalogFor(sessionId);
  },
  async call(token, name) {
    const sessionId = sessionsByToken.get(token);
    if (!sessionId) throw new Error("Agent tool token is not valid");
    return { caller: sessionId, name };
  },
};

async function listen() {
  const handler = createAgentToolHttpHandler(bridge);
  const server = http.createServer((request, response) => {
    if (!isAgentToolHttpRequest(request)) {
      response.writeHead(404);
      response.end();
      return;
    }
    void handler(request, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/mcp`;
}

async function connect(url: string, headers: Record<string, string>) {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    }),
  );
  return client;
}

describe("agent tool HTTP endpoint", () => {
  it("resolves each request's caller from its own bearer token", async () => {
    const url = await listen();
    const a = await connect(url, { Authorization: "Bearer token-a" });
    const b = await connect(url, { Authorization: "Bearer token-b" });
    try {
      const [toolsA, toolsB] = await Promise.all([
        a.listTools(),
        b.listTools(),
      ]);
      expect(toolsA.tools[0]?.name).toBe("messaging_list_agents");
      expect(toolsA.tools[0]?.description).toBe("List peers of s-a");
      expect(toolsB.tools[0]?.description).toBe("List peers of s-b");
      const result = await b.callTool({
        name: "messaging_list_agents",
        arguments: {},
      });
      expect(result.content).toEqual([
        {
          type: "text",
          text: '{\n  "caller": "s-b",\n  "name": "messaging_list_agents"\n}',
        },
      ]);
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });

  it("reports an invalid token as a tool error without leaking other sessions", async () => {
    const url = await listen();
    const client = await connect(url, { Authorization: "Bearer nope" });
    try {
      await expect(client.listTools()).rejects.toThrow(/not valid/);
      const result = await client.callTool({
        name: "messaging_list_agents",
        arguments: {},
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("rejects requests without a bearer token", async () => {
    const url = await listen();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(401);
  });
});
