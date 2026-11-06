import type {
  ApplicationPrincipal,
  ApplicationService,
} from "../../application-service";
import type { AgentToolRegistry } from "../tool-registry";

export function registerApplicationTools(
  registry: AgentToolRegistry,
  service: ApplicationService,
  principal: (sessionId: string) => Promise<ApplicationPrincipal>,
) {
  registry.register({
    descriptor: {
      group: "applications",
      name: "list",
      description:
        "List application connections this assistant may use. Connections belong to the host and are granted per assistant. If authorization is missing, ask the user to open Applications; never request their credentials in chat.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: () => true,
    execute: async (caller) => service.list(await principal(caller.sessionId)),
  });
  registry.register({
    descriptor: {
      group: "applications",
      name: "tools",
      description:
        "List the available tools and input schemas of an allowed application connection. Read this before calling a tool.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
    isAvailable: () => true,
    execute: async (caller, input) =>
      service.tools(String(input.id), await principal(caller.sessionId)),
  });
  registry.register({
    descriptor: {
      group: "applications",
      name: "read",
      description:
        "Call a provider-declared read-only application tool. Available in read-and-draft routines. The daemon refuses tools without an explicit read-only declaration; use applications_call only when the user has authorized the action and this session permits it.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          tool: { type: "string" },
          args: { type: "object" },
        },
        required: ["id", "tool", "args"],
        additionalProperties: false,
      },
    },
    isAvailable: () => true,
    execute: async (caller, input) =>
      service.read(
        String(input.id),
        String(input.tool),
        input.args as Record<string, unknown>,
        await principal(caller.sessionId),
      ),
  });
  registry.register({
    descriptor: {
      group: "applications",
      name: "call",
      description:
        "Call an application tool using exactly the schema returned by applications_tools. Follow the user's request and confirm consequential external actions when needed. A failed or timed-out write may already have succeeded; inspect the remote state before retrying.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          tool: { type: "string" },
          args: { type: "object" },
        },
        required: ["id", "tool", "args"],
        additionalProperties: false,
      },
    },
    isAvailable: () => true,
    execute: async (caller, input) =>
      service.call(
        String(input.id),
        String(input.tool),
        input.args as Record<string, unknown>,
        await principal(caller.sessionId),
      ),
  });
}
