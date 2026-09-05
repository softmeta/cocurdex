import type {
  ConversationMessageRecord,
  ConversationRecord,
} from "./conversation";

export interface ConversationSnapshot {
  conversation: ConversationRecord;
  messages: ConversationMessageRecord[];
  revision: number;
  runtimeId: string;
}

export type ChatEventPayload =
  | {
      type: "conversation.upserted";
      conversationId: string;
      conversation: ConversationRecord;
    }
  | { type: "conversation.deleted"; conversationId: string }
  | {
      type:
        | "conversation.message.created"
        | "conversation.message.updated"
        | "conversation.message.completed";
      conversationId: string;
      message: ConversationMessageRecord;
    }
  | {
      type: "conversation.messages.truncated";
      conversationId: string;
      remainingMessages: ConversationMessageRecord[];
    };

export type ChatEvent = ChatEventPayload & {
  revision: number;
  runtimeId: string;
};
