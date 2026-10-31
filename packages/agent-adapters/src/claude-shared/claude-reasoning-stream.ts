import type { AgentEvent } from "@cocurdex/shared";

function asRecord(value: unknown) {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function extractThinkingDelta(event: unknown): string | null {
  const record = asRecord(event);
  if (record?.type !== "content_block_delta") {
    return null;
  }

  const delta = asRecord(record.delta);
  if (delta?.type !== "thinking_delta" || typeof delta.thinking !== "string") {
    return null;
  }
  return delta.thinking || null;
}

export function extractThinkingText(contentBlocks: unknown[]) {
  return contentBlocks
    .flatMap((contentBlock) => {
      const block = asRecord(contentBlock);
      return block?.type === "thinking" && typeof block.thinking === "string"
        ? [block.thinking]
        : [];
    })
    .join("");
}

export function createClaudeReasoningStream(options: {
  sessionId: string;
  onEvent(event: AgentEvent): void;
}) {
  const { sessionId, onEvent } = options;
  let messageId = "";
  let createdAt = "";
  let content = "";
  let streamed = false;

  function clear() {
    messageId = "";
    createdAt = "";
    content = "";
  }

  return {
    append(delta: string) {
      if (!messageId) {
        messageId = crypto.randomUUID();
        createdAt = new Date().toISOString();
      }
      content += delta;
      streamed = true;
      onEvent({
        type: "message.delta",
        sessionId,
        messageId,
        role: "assistant",
        kind: "reasoning",
        delta,
        createdAt,
      });
    },
    complete(fallbackContent = "") {
      const finalContent = streamed ? content : fallbackContent;
      const id = messageId || crypto.randomUUID();
      const startedAt = createdAt || new Date().toISOString();
      clear();
      if (!finalContent.trim()) {
        return;
      }
      onEvent({
        type: "message.completed",
        sessionId,
        message: {
          id,
          sessionId,
          role: "assistant",
          kind: "reasoning",
          content: finalContent,
          attachments: [],
          createdAt: startedAt,
        },
      });
    },
    reset() {
      clear();
      streamed = false;
    },
  };
}
