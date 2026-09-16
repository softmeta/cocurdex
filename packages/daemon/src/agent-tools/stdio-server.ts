import {
  AGENT_TOOL_SERVER_NAME,
  AGENT_TOOL_TOKEN_ENV,
  AGENT_TOOL_USER_DATA_PATH_ENV,
  agentToolFullName,
} from "@cocurdex/shared";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { requestDaemon } from "../client";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resultText(result: unknown) {
  if (typeof result === "string") return result;
  return JSON.stringify(result ?? null, null, 2);
}

export async function runAgentToolStdioServer(env: NodeJS.ProcessEnv) {
  const token = env[AGENT_TOOL_TOKEN_ENV];
  const userDataPath = env[AGENT_TOOL_USER_DATA_PATH_ENV];
  if (!token || !userDataPath) {
    throw new Error(
      `Agent tool server requires ${AGENT_TOOL_TOKEN_ENV} and ${AGENT_TOOL_USER_DATA_PATH_ENV}`,
    );
  }
  const options = { userDataPath };
  const server = new Server(
    { name: AGENT_TOOL_SERVER_NAME, version: "1" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const catalog = await requestDaemon(
      "agentTool.catalog",
      { token },
      options,
    );
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
      const result = await requestDaemon(
        "agentTool.call",
        {
          token,
          name: request.params.name,
          input: request.params.arguments ?? {},
        },
        options,
      );
      return { content: [{ type: "text", text: resultText(result) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: errorText(error) }],
      };
    }
  });
  await server.connect(new StdioServerTransport());
}
