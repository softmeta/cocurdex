import type {
  ConversationContentPart,
  ConversationMessageRecord,
  SendConversationMessagePayload,
} from "@cocurdex/shared";

export function createChatMessage(
  conversationId: string,
  role: ConversationMessageRecord["role"],
  content: ConversationContentPart[],
  createdAt = new Date().toISOString(),
): ConversationMessageRecord {
  return {
    id: crypto.randomUUID(),
    conversationId,
    role,
    content,
    status: role === "assistant" ? "streaming" : "completed",
    usage: null,
    sources: [],
    error: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function composeChatInput(payload: SendConversationMessagePayload) {
  const content: ConversationContentPart[] = [];
  if (payload.text.trim())
    content.push({ type: "text", text: payload.text.trim() });
  for (const image of payload.images ?? []) {
    if (!/^data:image\/[^;,]+;base64,/.test(image.filePath)) {
      throw new Error("Chat images must be base64 image data URLs");
    }
    content.push({
      type: "image",
      image: image.filePath,
      mimeType: image.mimeType,
    });
  }
  if (!content.length) throw new Error("Message must include text or an image");
  return content;
}

export function chatSystemPrompt(system: string | null) {
  return [
    "Formatting rules:",
    "- Use $...$ for inline math and $$...$$ for block math.",
    "- Do not wrap math expressions in backticks.",
    "- Use fenced code blocks with a language for code.",
    system?.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ActiveChatTurn {
  controller: AbortController;
  message: ConversationMessageRecord | null;
  done: Promise<void>;
  release(): void;
}

export function createActiveChatTurn(): ActiveChatTurn {
  let release = () => {};
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { controller: new AbortController(), message: null, done, release };
}
