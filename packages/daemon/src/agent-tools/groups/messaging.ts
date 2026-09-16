import type {
  AgentToolCallerContext,
  PeerSessionSummary,
  SendPeerMessagePayload,
  SendPeerMessageResult,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export interface MessagingToolDependencies {
  listPeers(fromSessionId: string): Promise<PeerSessionSummary[]>;
  sendPeerMessage(
    payload: SendPeerMessagePayload,
  ): Promise<SendPeerMessageResult>;
}

const isNotSubagent = (caller: AgentToolCallerContext) =>
  caller.sessionKind !== "subagent";

export function registerMessagingTools(
  registry: AgentToolRegistry,
  deps: MessagingToolDependencies,
) {
  registry.register({
    descriptor: {
      group: "messaging",
      name: "list_agents",
      description:
        "List the other Cocurdex agent sessions you can message, with their ids, titles, and status.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: isNotSubagent,
    execute: (caller) => deps.listPeers(caller.sessionId),
  });
  registry.register({
    descriptor: {
      group: "messaging",
      name: "send_message",
      description:
        "Send a text message to another Cocurdex agent session by its session id. The message is delivered as a new turn when that session is idle, or queued after its current turn. Every message starts a turn for the receiver, so do not send pure acknowledgements or thanks. Delivery loop_limit means the two sessions exchanged too many messages without user input; stop messaging and summarize for the user instead.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Target session id" },
          message: { type: "string", description: "Message text" },
        },
        required: ["to", "message"],
        additionalProperties: false,
      },
    },
    isAvailable: isNotSubagent,
    execute: (caller, input) =>
      deps.sendPeerMessage({
        fromSessionId: caller.sessionId,
        toSessionId: String(input.to),
        content: String(input.message),
      }),
  });
}
