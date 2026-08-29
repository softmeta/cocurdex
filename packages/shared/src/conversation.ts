// ChatGPT-style pure conversation types. Decoupled from agent sessions —
// no workspace, no tool calls, no permissions. See docs/plans/2026-05-21-chat-mode.md.

import type { ImageAttachment } from "./contracts";

export type ConversationMessageRole = "user" | "assistant" | "system";

export type ConversationMessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "errored";

// Multi-modal message parts modelled after Vercel AI SDK ModelMessage parts.
// Persisted as JSON in conversation_messages.content_json.
export interface ConversationTextPart {
  type: "text";
  text: string;
}

export interface ConversationImagePart {
  type: "image";
  // base64 data URL or an in-memory file reference. Stored verbatim;
  // adapters decide how to feed it to the SDK.
  image: string;
  mimeType?: string;
}

export interface ConversationToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ConversationToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: unknown;
}

export type ConversationContentPart =
  | ConversationTextPart
  | ConversationImagePart
  | ConversationToolCallPart
  | ConversationToolResultPart;

export interface ConversationUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  // Estimated USD cost of the turn, computed from the model's cost table
  // (input/output price per 1M tokens). Absent when the model has no pricing.
  costUsd?: number;
  // Wall-clock duration of the assistant turn in milliseconds.
  durationMs?: number;
}

// Web search citation surfaced by provider-hosted or custom search tools.
export interface ConversationSource {
  url: string;
  title: string;
  snippet?: string | null;
  // Provider-specific identifier, useful for de-dup or in-message anchoring.
  providerSourceId?: string | null;
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  role: ConversationMessageRole;
  content: ConversationContentPart[];
  status: ConversationMessageStatus;
  usage: ConversationUsage | null;
  sources: ConversationSource[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  systemPrompt: string | null;
  presetId: string | null;
  webSearchEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  archivedAt: string | null;
}

// === RPC payloads ===

export interface CreateConversationPayload {
  providerId: string;
  modelId: string;
  title?: string;
  systemPrompt?: string | null;
  presetId?: string | null;
  webSearchEnabled?: boolean;
}

export interface UpdateConversationPayload {
  conversationId: string;
  title?: string;
  systemPrompt?: string | null;
  presetId?: string | null;
  webSearchEnabled?: boolean;
  providerId?: string;
  modelId?: string;
}

// User-facing message input. The daemon expands this into a persisted
// ConversationMessageRecord and triggers a streaming LLM call.
export interface SendConversationMessagePayload {
  conversationId: string;
  // Plain text body; the daemon wraps it into a text content part.
  text: string;
  // Optional image attachments (reuse the existing ImageAttachment shape so
  // the composer UI from features/chat can be lifted with no translation).
  images?: ImageAttachment[];
  // Override the conversation's persisted web_search_enabled for this turn.
  webSearchOverride?: boolean;
}

export interface ArchiveConversationPayload {
  conversationId: string;
}

export interface DeleteConversationPayload {
  conversationId: string;
}

export interface StopConversationStreamPayload {
  conversationId: string;
}

// Re-run the assistant turn for an existing assistant message (error retry or
// regenerate). Deletes that message and everything after it, then streams a
// fresh response from the preceding history.
export interface RetryConversationMessagePayload {
  conversationId: string;
  messageId: string;
}

// Edit a user prompt and re-send: updates its text, drops all later turns,
// then streams a new assistant response.
export interface EditConversationMessagePayload {
  conversationId: string;
  messageId: string;
  text: string;
}
