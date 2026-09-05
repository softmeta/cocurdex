import type { ConversationMessageRecord } from "@cocurdex/shared";
import type {
  Api,
  Context,
  ImageContent,
  Model,
  TextContent,
} from "@earendil-works/pi-ai";

export function toChatContext(
  messages: ConversationMessageRecord[],
  model: Model<Api>,
  system?: string,
): Context {
  const context: Context = { systemPrompt: system, messages: [] };
  for (const message of messages) {
    const text = message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n");
    const timestamp = Date.parse(message.createdAt);
    if (message.role === "system") {
      context.systemPrompt = [context.systemPrompt, text]
        .filter(Boolean)
        .join("\n\n");
    } else if (message.role === "user") {
      const content: (TextContent | ImageContent)[] = [];
      for (const part of message.content) {
        if (part.type === "text" && part.text)
          content.push({ type: "text", text: part.text });
        if (part.type === "image") {
          if (!model.input.includes("image"))
            throw new Error("The selected model does not support images");
          const match =
            /^data:(image\/[^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(
              part.image,
            );
          if (!match)
            throw new Error("Chat images must be base64 image data URLs");
          content.push({ type: "image", mimeType: match[1], data: match[2] });
        }
      }
      if (content.length)
        context.messages.push({ role: "user", content, timestamp });
    } else if (text.trim()) {
      context.messages.push({
        role: "assistant",
        content: [{ type: "text", text }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp,
      });
    }
  }
  return context;
}
