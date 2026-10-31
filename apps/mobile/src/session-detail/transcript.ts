import {
  type AgentPermissionRequestRecord,
  type AgentPlanApprovalRecord,
  type AgentQuestionRequestRecord,
  type AgentToolCallRecord,
  getToolCallInputSummary,
  type ImageAttachment,
  isImageAttachment,
  type MessageRecord,
  type SessionInteractionSnapshot,
} from "@cocurdex/shared";

export type TranscriptItem =
  | { kind: "user"; id: string; text: string; images: ImageAttachment[] }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | {
      kind: "tool";
      id: string;
      title: string;
      detail: string | null;
      status: AgentToolCallRecord["status"];
    };

export type PendingInteraction =
  | { kind: "permission"; record: AgentPermissionRequestRecord }
  | { kind: "question"; record: AgentQuestionRequestRecord }
  | { kind: "plan"; record: AgentPlanApprovalRecord };

export interface TranscriptInput {
  messages: readonly MessageRecord[];
  activeMessages: readonly MessageRecord[];
  toolCalls: readonly AgentToolCallRecord[];
  workspacePath: string | null;
}

interface Ordered {
  seq: number | undefined;
  at: string;
  item: TranscriptItem;
}

function compareOrdered(left: Ordered, right: Ordered) {
  if (left.seq !== undefined && right.seq !== undefined) {
    return left.seq - right.seq;
  }
  return left.at.localeCompare(right.at);
}

function messageItem(
  message: MessageRecord,
  streaming: boolean,
): TranscriptItem | null {
  if (message.kind === "reasoning") return null;
  const images = message.attachments.filter(isImageAttachment);
  const text = message.content.trim() === "" ? "" : message.content;
  if (message.role === "user" && (text !== "" || images.length > 0)) {
    return { kind: "user", id: message.id, text, images };
  }
  if (text === "") return null;
  if (message.role === "assistant") {
    return {
      kind: "assistant",
      id: message.id,
      text: message.content,
      streaming,
    };
  }
  return null;
}

function orderedMessages(
  messages: readonly MessageRecord[],
  streaming: boolean,
): Ordered[] {
  return messages.flatMap((message) => {
    const item = messageItem(message, streaming);
    return item ? [{ seq: message.seq, at: message.createdAt, item }] : [];
  });
}

function toolItem(
  call: AgentToolCallRecord,
  workspacePath: string | null,
): TranscriptItem {
  const title = call.title.charAt(0).toUpperCase() + call.title.slice(1);
  const summary = getToolCallInputSummary(call, workspacePath);
  const detail = summary && !title.includes(summary) ? summary : null;
  return { kind: "tool", id: call.id, title, detail, status: call.status };
}

export function buildTranscript(input: TranscriptInput): TranscriptItem[] {
  const finishedIds = new Set(input.messages.map((message) => message.id));
  const finished = [
    ...orderedMessages(input.messages, false),
    ...input.toolCalls.map((call) => ({
      seq: call.seq,
      at: call.startedAt,
      item: toolItem(call, input.workspacePath),
    })),
  ].sort(compareOrdered);
  const streaming = orderedMessages(
    input.activeMessages.filter((message) => !finishedIds.has(message.id)),
    true,
  ).sort(compareOrdered);
  return [...finished, ...streaming].map((entry) => entry.item);
}

export function pendingInteraction(
  interactions: SessionInteractionSnapshot,
): PendingInteraction | null {
  const candidates: PendingInteraction[] = [
    ...interactions.permissions
      .filter((record) => record.status === "pending")
      .map((record) => ({ kind: "permission" as const, record })),
    ...interactions.questions
      .filter((record) => record.status === "pending")
      .map((record) => ({ kind: "question" as const, record })),
    ...interactions.planApprovals
      .filter((record) => record.status === "pending")
      .map((record) => ({ kind: "plan" as const, record })),
  ];
  candidates.sort((left, right) =>
    left.record.createdAt.localeCompare(right.record.createdAt),
  );
  return candidates[0] ?? null;
}
