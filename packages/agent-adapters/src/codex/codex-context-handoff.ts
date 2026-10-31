import type { AgentContextHandoff } from "@cocurdex/agent-core";
import { logAdapterDiagnostic } from "../diagnostics";

export interface CodexHistoryInjector {
  injectItems(params: {
    threadId: string;
    items: readonly unknown[];
  }): Promise<void>;
}

function responseMessage(role: "user" | "assistant", text: string) {
  return {
    type: "message",
    role,
    content: [{ type: role === "user" ? "input_text" : "output_text", text }],
  };
}

export function contextHandoffResponseItems(handoff: AgentContextHandoff) {
  return [
    responseMessage("user", handoff.preamble),
    ...handoff.entries.map((entry) => responseMessage(entry.role, entry.text)),
  ];
}

export async function prepareCodexTurnContent(
  injector: CodexHistoryInjector,
  threadId: string,
  content: string,
  handoff: AgentContextHandoff | undefined,
) {
  if (!handoff) return content;
  try {
    await injector.injectItems({
      threadId,
      items: contextHandoffResponseItems(handoff),
    });
    return content;
  } catch (error) {
    logAdapterDiagnostic("info", "[CodexAdapter] history injection failed", {
      error: error instanceof Error ? error.message : String(error),
      providerSessionId: threadId,
    });
    return `${handoff.text}\n\n${content}`;
  }
}
