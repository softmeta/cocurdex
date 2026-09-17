import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AGENT_TOOL_HTTP_PATH,
  AGENT_TOOL_SERVER_NAME,
  type AgentToolCatalog,
  agentToolFullName,
  agentToolTokenFromAuthorization,
} from "@cocurdex/shared";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface AgentToolHttpBridge {
  catalog(token: string): Promise<AgentToolCatalog>;
  call(token: string, name: string, input: unknown): Promise<unknown>;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resultText(result: unknown) {
  if (typeof result === "string") return result;
  return JSON.stringify(result ?? null, null, 2);
}

function createMcpServer(bridge: AgentToolHttpBridge, token: string) {
  const server = new Server(
    { name: AGENT_TOOL_SERVER_NAME, version: "1" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const catalog = await bridge.catalog(token);
    return {
      tools: catalog.tools.map((tool) => ({
        name: agentToolFullName(tool),
        description: tool.description,
        inputSchema: tool.inputSchema as {
          type: "object";
          properties?: Record<string, unknown>;
          required?: string[];
        },
      })),
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await bridge.call(
        token,
        request.params.name,
        request.params.arguments ?? {},
      );
      return { content: [{ type: "text", text: resultText(result) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: errorText(error) }],
      };
    }
  });
  return server;
}

export function isAgentToolHttpRequest(request: IncomingMessage) {
  const pathname = (request.url ?? "").split("?")[0];
  return pathname === AGENT_TOOL_HTTP_PATH;
}

export function createAgentToolHttpHandler(bridge: AgentToolHttpBridge) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const token = agentToolTokenFromAuthorization(
      request.headers.authorization,
    );
    if (!token) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: "Missing bearer token for agent tools" }),
      );
      return;
    }
    const server = createMcpServer(bridge, token);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response);
  };
}
