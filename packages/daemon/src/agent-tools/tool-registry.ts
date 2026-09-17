import {
  type AgentToolCallerContext,
  type AgentToolCatalog,
  type AgentToolDescriptor,
  agentToolFullName,
} from "@cocurdex/shared";
import { validateAgentToolInput } from "./tool-input";

export type AgentToolErrorCode =
  | "UNKNOWN_TOOL"
  | "TOOL_UNAVAILABLE"
  | "UNAUTHORIZED_AGENT_TOOL";

export class AgentToolError extends Error {
  override readonly name = "AgentToolError";

  constructor(
    readonly code: AgentToolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface AgentToolHandler<
  Input extends Record<string, unknown> = Record<string, unknown>,
  Output = unknown,
> {
  descriptor: AgentToolDescriptor;
  isAvailable(caller: AgentToolCallerContext): boolean;
  execute(caller: AgentToolCallerContext, input: Input): Promise<Output>;
}

export class AgentToolRegistry {
  private readonly handlers = new Map<string, AgentToolHandler>();

  register(handler: AgentToolHandler) {
    const name = agentToolFullName(handler.descriptor);
    if (this.handlers.has(name)) {
      throw new Error(`Agent tool '${name}' is already registered`);
    }
    this.handlers.set(name, handler);
  }

  catalog(caller: AgentToolCallerContext): AgentToolCatalog {
    const tools = [...this.handlers.values()]
      .filter((handler) => handler.isAvailable(caller))
      .map((handler) => handler.descriptor);
    return { caller, tools };
  }

  async call(caller: AgentToolCallerContext, name: string, input: unknown) {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new AgentToolError("UNKNOWN_TOOL", `Unknown agent tool '${name}'`);
    }
    if (!handler.isAvailable(caller)) {
      throw new AgentToolError(
        "TOOL_UNAVAILABLE",
        `Agent tool '${name}' is not available to this session`,
      );
    }
    const validated = validateAgentToolInput(
      handler.descriptor.inputSchema,
      input ?? {},
    );
    return handler.execute(caller, validated);
  }
}
