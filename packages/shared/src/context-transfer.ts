import type { AgentId, MessageRecord, RunRecord } from "./contracts";

export type ContextTransferKind = "fork" | "agent_switch";

export type ContextTransferStatus = "pending" | "consumed";

export type ContextHandoffStrategy = "full" | "delta";

export type ContextTransferStrategy = ContextHandoffStrategy | "native";

export interface ContextTransferRecord {
  id: string;
  kind: ContextTransferKind;
  sourceSessionId: string;
  targetSessionId: string;
  sourceMessageId: string | null;
  sourceAgentTypes: AgentId[];
  targetAgentType: AgentId | null;
  status: ContextTransferStatus;
  strategy: ContextTransferStrategy | null;
  coveredMessageCount: number;
  handoffText: string | null;
  consumedByMessageId: string | null;
  createdAt: string;
  consumedAt: string | null;
}

export interface ForkSessionPayload {
  sessionId: string;
  throughMessageId?: string;
  title?: string;
}

export type StartContextRun = Pick<
  RunRecord,
  "id" | "triggerMessageId" | "agentType"
>;

export interface StartContextInput {
  targetAgentType: AgentId;
  priorMessages: readonly MessageRecord[];
  runs: readonly StartContextRun[];
  hasProviderThread: boolean;
  pendingFork: boolean;
}

export type StartContextResolution =
  | { kind: "native" }
  | {
      kind: "handoff";
      transferKind: ContextTransferKind;
      strategy: ContextHandoffStrategy;
      messages: MessageRecord[];
      sourceAgentTypes: AgentId[];
      freshProviderThread: boolean;
    };

export function messageAgentLookup(runs: readonly StartContextRun[]) {
  const byId = new Map(runs.map((run) => [run.id, run]));
  const byTrigger = new Map(runs.map((run) => [run.triggerMessageId, run]));
  return (message: MessageRecord): AgentId | null => {
    const run =
      (message.runId ? byId.get(message.runId) : undefined) ??
      byTrigger.get(message.id);
    return run?.agentType ?? null;
  };
}

export function isHandoffVisibleMessage(message: MessageRecord) {
  if (message.role === "system") return false;
  if (message.kind === "reasoning") return false;
  return message.content.trim().length > 0;
}

function distinctAgents(
  messages: readonly MessageRecord[],
  agentOf: (message: MessageRecord) => AgentId | null,
  exclude: AgentId | null,
) {
  const agents = new Set<AgentId>();
  for (const message of messages) {
    const agent = agentOf(message);
    if (agent && agent !== exclude) agents.add(agent);
  }
  return [...agents];
}

export function resolveStartContext(
  input: StartContextInput,
): StartContextResolution {
  const { priorMessages, targetAgentType } = input;
  const agentOf = messageAgentLookup(input.runs);
  const visible = (messages: readonly MessageRecord[]) =>
    messages.filter(isHandoffVisibleMessage);

  if (input.pendingFork && !input.hasProviderThread) {
    return {
      kind: "handoff",
      transferKind: "fork",
      strategy: "full",
      messages: visible(priorMessages),
      sourceAgentTypes: distinctAgents(priorMessages, agentOf, null),
      freshProviderThread: true,
    };
  }

  const foreign = (messages: readonly MessageRecord[]) =>
    distinctAgents(messages, agentOf, targetAgentType);

  if (!input.hasProviderThread) {
    const sourceAgentTypes = foreign(priorMessages);
    if (sourceAgentTypes.length === 0) return { kind: "native" };
    return {
      kind: "handoff",
      transferKind: "agent_switch",
      strategy: "full",
      messages: visible(priorMessages),
      sourceAgentTypes,
      freshProviderThread: true,
    };
  }

  let lastNativeIndex = -1;
  priorMessages.forEach((message, index) => {
    if (agentOf(message) === targetAgentType) lastNativeIndex = index;
  });
  const unseen = priorMessages.slice(lastNativeIndex + 1);
  const sourceAgentTypes = foreign(unseen);
  if (sourceAgentTypes.length === 0) return { kind: "native" };
  return {
    kind: "handoff",
    transferKind: "agent_switch",
    strategy: lastNativeIndex < 0 ? "full" : "delta",
    messages: visible(unseen),
    sourceAgentTypes,
    freshProviderThread: false,
  };
}
