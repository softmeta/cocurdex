import type { AgentToolInvoker } from "@cocurdex/agent-core";
import { type AgentToolDescriptor, agentToolFullName } from "@cocurdex/shared";
import {
  type ConversationId,
  defineExtension,
  defineTool,
  type Extension,
  type PromptInput,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { TOOL_SEARCH_TOOL_NAME } from "@earendil-works/pi-durable/tool-search";

export const AGENT_TOOLS_EXTENSION = "cocurdex-agent-tools";

/** How long a resumed call waits for its session to bind after a daemon restart. */
const BINDING_TIMEOUT_MS = 60_000;

/**
 * Names the deferred Cocurdex tools this conversation can call, so instructions that mention one
 * lead the model to load it. Listed whether or not a search loaded it yet, so the prompt stays stable.
 */
function renderDeferredTools(
  input: PromptInput,
  isAgentTool: (name: string) => boolean,
) {
  const names = [...input.agent.tools, ...input.agent.deferred]
    .filter((tool) => tool.deferred === true && isAgentTool(tool.name))
    .map((tool) => tool.name)
    .sort();
  if (names.length === 0) return undefined;
  return [
    `These Cocurdex tools are not offered upfront. Load one with ${TOOL_SEARCH_TOOL_NAME} (search by its name or purpose) before calling it:`,
    names.join(", "),
  ].join("\n");
}

function resultText(result: unknown) {
  if (typeof result === "string") return result;
  return JSON.stringify(result ?? null, null, 2);
}

/**
 * Cocurdex agent tools for every durable conversation. Tools are registered once per name; each
 * call reaches the daemon through the invoker its conversation's session bound, which also
 * enforces whether the tool is available to that session.
 */
export class DurableAgentTools {
  private readonly descriptors = new Map<string, AgentToolDescriptor>();
  private readonly invokers = new Map<ConversationId, AgentToolInvoker>();
  private readonly waiters = new Map<
    ConversationId,
    Array<(invoker: AgentToolInvoker) => void>
  >();

  /** Binds a conversation's invoker; returns true when new tool names appeared. */
  async bind(conversationId: ConversationId, invoker: AgentToolInvoker) {
    this.invokers.set(conversationId, invoker);
    for (const resolve of this.waiters.get(conversationId) ?? []) {
      resolve(invoker);
    }
    this.waiters.delete(conversationId);
    const catalog = await invoker.catalog();
    let added = false;
    for (const descriptor of catalog.tools) {
      const name = agentToolFullName(descriptor);
      if (!this.descriptors.has(name)) added = true;
      this.descriptors.set(name, descriptor);
    }
    return added;
  }

  unbind(conversationId: ConversationId, invoker: AgentToolInvoker) {
    if (this.invokers.get(conversationId) === invoker) {
      this.invokers.delete(conversationId);
    }
  }

  extension(): Extension {
    return defineExtension({
      name: AGENT_TOOLS_EXTENSION,
      tools: [...this.descriptors.entries()].map(([name, descriptor]) =>
        this.tool(name, descriptor),
      ),
      sections: [
        {
          key: "cocurdex_deferred_tools",
          render: (input) =>
            renderDeferredTools(input, (name) => this.descriptors.has(name)),
        },
      ],
    });
  }

  private tool(name: string, descriptor: AgentToolDescriptor) {
    return defineTool({
      name,
      description: descriptor.description,
      parameters: descriptor.inputSchema,
      replay: descriptor.readOnly ? "safe" : "unsafe",
      deferred: descriptor.deferred,
      execute: async (args, api) => {
        const invoker = await this.invokerFor(api.conversationId);
        const result = await invoker.call(name, args ?? {});
        return { output: [{ type: "text", text: resultText(result) }] };
      },
    }) as ToolRegistration;
  }

  private invokerFor(conversationId: ConversationId) {
    const bound = this.invokers.get(conversationId);
    if (bound) return Promise.resolve(bound);
    return new Promise<AgentToolInvoker>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiting = this.waiters.get(conversationId) ?? [];
        this.waiters.set(
          conversationId,
          waiting.filter((entry) => entry !== deliver),
        );
        reject(new Error("Cocurdex tools are not available to this session"));
      }, BINDING_TIMEOUT_MS);
      timer.unref?.();
      const deliver = (invoker: AgentToolInvoker) => {
        clearTimeout(timer);
        resolve(invoker);
      };
      this.waiters.set(conversationId, [
        ...(this.waiters.get(conversationId) ?? []),
        deliver,
      ]);
    });
  }
}
