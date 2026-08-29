// Streaming events for the pure-chat mode. Kept separate from AgentEvent so
// the chat protocol can evolve without touching the agent runtime.
// See docs/plans/2026-05-21-chat-mode.md §3 (Daemon layer).

import type {
  ConversationMessageRecord,
  ConversationRecord,
  ConversationSource,
  ConversationUsage,
} from "./conversation";

export interface ConversationMessageCreatedEvent {
  type: "conversation.message.created";
  conversationId: string;
  message: ConversationMessageRecord;
}

// Incremental text delta. `delta` is appended to the in-flight assistant
// message's last text part. Multiple deltas may arrive interleaved with
// tool-call / source events.
export interface ConversationMessageTextDeltaEvent {
  type: "conversation.message.delta";
  conversationId: string;
  messageId: string;
  delta: string;
}

export interface ConversationMessageToolCallEvent {
  type: "conversation.message.tool-call";
  conversationId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ConversationMessageToolResultEvent {
  type: "conversation.message.tool-result";
  conversationId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  output: unknown;
}

export interface ConversationMessageSourceEvent {
  type: "conversation.message.source";
  conversationId: string;
  messageId: string;
  source: ConversationSource;
}

export interface ConversationMessageUsageEvent {
  type: "conversation.message.usage";
  conversationId: string;
  messageId: string;
  usage: ConversationUsage;
}

export interface ConversationMessageCompletedEvent {
  type: "conversation.message.completed";
  conversationId: string;
  message: ConversationMessageRecord;
}

export interface ConversationMessageErroredEvent {
  type: "conversation.message.errored";
  conversationId: string;
  messageId: string;
  error: string;
}

export interface ConversationUpsertedEvent {
  type: "conversation.upserted";
  conversationId: string;
  conversation: ConversationRecord;
}

export interface ConversationDeletedEvent {
  type: "conversation.deleted";
  conversationId: string;
}

// Emitted after edit/retry truncates the transcript so the renderer can drop
// stale rows without re-fetching the whole conversation.
export interface ConversationMessagesTruncatedEvent {
  type: "conversation.messages.truncated";
  conversationId: string;
  remainingMessages: ConversationMessageRecord[];
}

export type ChatEvent =
  | ConversationMessageCreatedEvent
  | ConversationMessageTextDeltaEvent
  | ConversationMessageToolCallEvent
  | ConversationMessageToolResultEvent
  | ConversationMessageSourceEvent
  | ConversationMessageUsageEvent
  | ConversationMessageCompletedEvent
  | ConversationMessageErroredEvent
  | ConversationUpsertedEvent
  | ConversationDeletedEvent
  | ConversationMessagesTruncatedEvent;
