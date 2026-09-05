import { validateChatRequest } from "@cocurdex/llm-chat";
import type {
  AgentRuntimeProviderConfig,
  ChatEventPayload,
  ConversationContentPart,
  ConversationMessageRecord,
  EditConversationMessagePayload,
  RetryConversationMessagePayload,
  SendConversationMessagePayload,
} from "@cocurdex/shared";
import type { ChatStore } from "./chat-store";
import {
  type ActiveChatTurn,
  composeChatInput,
  createChatMessage,
} from "./chat-turn";

export type TurnRequest =
  | { kind: "send"; payload: SendConversationMessagePayload }
  | { kind: "retry"; payload: RetryConversationMessagePayload }
  | { kind: "edit"; payload: EditConversationMessagePayload };

export async function prepareChatTurn(
  store: ChatStore,
  emit: (event: ChatEventPayload) => void,
  request: TurnRequest,
  config: AgentRuntimeProviderConfig,
  turn: ActiveChatTurn,
) {
  const id = request.payload.conversationId;
  const conversation = await store.require(id);
  if (conversation.archivedAt) throw new Error("Conversation is archived");
  if (
    config.providerId !== conversation.providerId ||
    config.modelId !== conversation.modelId
  ) {
    throw new Error("The conversation model changed; send the message again");
  }
  const previous = await store.messages(id);
  let history = previous;
  let deleted: ConversationMessageRecord[] = [];
  let user: ConversationMessageRecord;
  if (request.kind === "send") {
    const timestamp = new Date(
      Math.max(
        Date.now(),
        Date.parse(previous.at(-1)?.createdAt ?? "") + 1 || 0,
      ),
    ).toISOString();
    user = createChatMessage(
      id,
      "user",
      composeChatInput(request.payload),
      timestamp,
    );
    history = [...previous, user];
  } else {
    const index = previous.findIndex(
      (message) => message.id === request.payload.messageId,
    );
    const target = previous[index];
    const role = request.kind === "retry" ? "assistant" : "user";
    if (!target || target.role !== role)
      throw new Error("Message cannot be edited or retried");
    const keep = request.kind === "retry" ? index : index + 1;
    history = previous.slice(0, keep);
    deleted = previous.slice(keep);
    if (request.kind === "edit") {
      const content: ConversationContentPart[] = target.content.filter(
        (part) => part.type === "image",
      );
      if (request.payload.text.trim())
        content.unshift({ type: "text", text: request.payload.text.trim() });
      if (!content.length)
        throw new Error("Message must include text or an image");
      user = { ...target, content, updatedAt: new Date().toISOString() };
      history[history.length - 1] = user;
    } else {
      const lastUser = [...history]
        .reverse()
        .find((message) => message.role === "user");
      if (!lastUser) throw new Error("No user message to retry");
      user = lastUser;
    }
  }
  validateChatRequest(config, history);
  turn.controller.signal.throwIfAborted();
  const timestamp = new Date(
    Math.max(Date.now(), Date.parse(history.at(-1)?.createdAt ?? "") + 1 || 0),
  ).toISOString();
  const assistant = createChatMessage(
    id,
    "assistant",
    [{ type: "text", text: "" }],
    timestamp,
  );
  const next = {
    ...conversation,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
  };
  await store.commit(next, [user, assistant], deleted);
  turn.message = assistant;
  if (request.kind === "send")
    emit({
      type: "conversation.message.created",
      conversationId: id,
      message: user,
    });
  else
    emit({
      type: "conversation.messages.truncated",
      conversationId: id,
      remainingMessages: history,
    });
  emit({
    type: "conversation.upserted",
    conversationId: id,
    conversation: next,
  });
  emit({
    type: "conversation.message.created",
    conversationId: id,
    message: assistant,
  });
  return { conversation: next, user, history };
}
