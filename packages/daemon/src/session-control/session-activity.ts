import {
  type AgentId,
  type AgentToolCallRecord,
  type ContextTransferRecord,
  type HandoffItem,
  isHandoffVisibleMessage,
  type MessageRecord,
  messageAgentLookup,
  messageHandoffItem,
  type StartContextRun,
  toolCallHandoffItem,
} from "@cocurdex/shared";

export interface SessionActivityInput {
  messages: readonly MessageRecord[];
  toolCalls: readonly AgentToolCallRecord[];
  runs: readonly StartContextRun[];
  outputChars?: number;
}

interface TimedItem {
  at: string;
  item: HandoffItem;
}

export function toolCallAgentLookup(runs: readonly StartContextRun[]) {
  const byId = new Map(runs.map((run) => [run.id, run.agentType]));
  return (toolCall: AgentToolCallRecord): AgentId | null =>
    (toolCall.runId ? byId.get(toolCall.runId) : undefined) ?? null;
}

function timedItems(input: SessionActivityInput): TimedItem[] {
  const agentOfMessage = messageAgentLookup(input.runs);
  const agentOfToolCall = toolCallAgentLookup(input.runs);
  const messages = input.messages
    .filter(isHandoffVisibleMessage)
    .map((message) => ({
      at: message.createdAt,
      item: messageHandoffItem(message, agentOfMessage(message)),
    }));
  const toolCalls = input.toolCalls.flatMap((toolCall) => {
    const item = toolCallHandoffItem(
      toolCall,
      agentOfToolCall(toolCall),
      input.outputChars,
    );
    return item ? [{ at: toolCall.startedAt, item }] : [];
  });
  return [...messages, ...toolCalls];
}

const byPosition = (left: TimedItem, right: TimedItem) =>
  (left.item.position ?? 0) - (right.item.position ?? 0);

const byTime = (left: TimedItem, right: TimedItem) =>
  left.at.localeCompare(right.at);

export function sessionActivityItems(input: SessionActivityInput) {
  return timedItems(input)
    .sort(byPosition)
    .map((entry) => entry.item);
}

export function mergedActivityItems(
  parts: readonly SessionActivityInput[],
): HandoffItem[] {
  return parts
    .flatMap((part) => timedItems(part))
    .sort(byTime)
    .map((entry) => entry.item);
}

export function forkPositionBound(
  messages: readonly MessageRecord[],
  forkMessageId: string | null,
) {
  const index = messages.findIndex((message) => message.id === forkMessageId);
  if (index < 0) return Number.NEGATIVE_INFINITY;
  return messages[index + 1]?.seq ?? Number.POSITIVE_INFINITY;
}

export interface HandoffCollectionInput {
  targetSessionId: string;
  targetAgentType: AgentId;
  messages: readonly MessageRecord[];
  runs: readonly StartContextRun[];
  fork: ContextTransferRecord | null;
}

export async function collectHandoffItems(
  reader: SessionActivityReader,
  input: HandoffCollectionInput,
) {
  const { fork } = input;
  if (fork) {
    const [sourceMessages, sourceToolCalls] = await Promise.all([
      reader.listMessages(fork.sourceSessionId),
      reader.listToolCalls(fork.sourceSessionId),
    ]);
    const bound = forkPositionBound(sourceMessages, fork.sourceMessageId);
    return mergedActivityItems([
      { messages: input.messages, toolCalls: [], runs: input.runs },
      {
        messages: [],
        toolCalls: sourceToolCalls.filter(
          (toolCall) => (toolCall.seq ?? Number.POSITIVE_INFINITY) < bound,
        ),
        runs: reader.listRuns(fork.sourceSessionId),
      },
    ]);
  }
  const firstSeq = Math.min(
    ...input.messages.map((message) => message.seq ?? Number.POSITIVE_INFINITY),
  );
  const agentOf = toolCallAgentLookup(input.runs);
  const toolCalls = (await reader.listToolCalls(input.targetSessionId)).filter(
    (toolCall) =>
      (toolCall.seq ?? -1) >= firstSeq &&
      agentOf(toolCall) !== input.targetAgentType,
  );
  return sessionActivityItems({
    messages: input.messages,
    toolCalls,
    runs: input.runs,
  });
}

export interface SessionActivityReader {
  listMessages(sessionId: string): Promise<MessageRecord[]>;
  listToolCalls(sessionId: string): Promise<AgentToolCallRecord[]>;
  listRuns(sessionId: string): readonly StartContextRun[];
  listTransfers(sessionId: string): readonly ContextTransferRecord[];
}

const MAX_FORK_DEPTH = 8;

function forkAncestors(reader: SessionActivityReader, sessionId: string) {
  const ancestors = new Map<string, string | null>();
  let current = sessionId;
  for (let depth = 0; depth < MAX_FORK_DEPTH; depth++) {
    const fork = reader
      .listTransfers(current)
      .find((transfer) => transfer.kind === "fork");
    if (!fork || ancestors.has(fork.sourceSessionId)) break;
    ancestors.set(fork.sourceSessionId, fork.sourceMessageId);
    current = fork.sourceSessionId;
  }
  return ancestors;
}

export async function readSessionActivity(
  reader: SessionActivityReader,
  callerSessionId: string,
  sessionId: string,
): Promise<HandoffItem[]> {
  const ancestors = forkAncestors(reader, callerSessionId);
  if (sessionId !== callerSessionId && !ancestors.has(sessionId)) {
    throw new Error(
      `Session ${sessionId} is not this session or one it was forked from`,
    );
  }
  const [messages, toolCalls] = await Promise.all([
    reader.listMessages(sessionId),
    reader.listToolCalls(sessionId),
  ]);
  const items = sessionActivityItems({
    messages,
    toolCalls,
    runs: reader.listRuns(sessionId),
    outputChars: Number.POSITIVE_INFINITY,
  });
  if (sessionId === callerSessionId) return items;
  const bound = forkPositionBound(messages, ancestors.get(sessionId) ?? null);
  return items.filter((item) => (item.position ?? 0) < bound);
}
