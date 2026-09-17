import type { AgentToolInvoker } from "@cocurdex/agent-core";
import { agentToolFullName } from "@cocurdex/shared";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

function resultText(result: unknown) {
  if (typeof result === "string") return result;
  return JSON.stringify(result ?? null, null, 2);
}

export async function createPiAgentToolDefinitions(
  invoker: AgentToolInvoker | null | undefined,
): Promise<ToolDefinition[]> {
  if (!invoker) return [];
  const catalog = await invoker.catalog();
  return catalog.tools.map((descriptor) => {
    const name = agentToolFullName(descriptor);
    return {
      name,
      label: name,
      description: descriptor.description,
      parameters: descriptor.inputSchema as ToolDefinition["parameters"],
      async execute(_toolCallId, params) {
        const result = await invoker.call(name, params ?? {});
        return {
          content: [{ type: "text", text: resultText(result) }],
          details: undefined,
        };
      },
    };
  });
}
