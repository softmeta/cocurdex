import type { ContentBlock } from "@agentclientprotocol/sdk";

export const GROK_INTERJECT_REQUEST_METHOD = "x.ai/interject";

export function buildGrokInterjectParams(input: {
  messageId: string;
  prompt: ContentBlock[];
  providerSessionId: string;
}): Record<string, unknown> {
  const text = input.prompt.find(
    (block): block is Extract<ContentBlock, { type: "text" }> =>
      block.type === "text",
  )?.text;

  return {
    sessionId: input.providerSessionId,
    text: text ?? "",
    interjectionId: input.messageId,
    content: input.prompt,
  };
}
