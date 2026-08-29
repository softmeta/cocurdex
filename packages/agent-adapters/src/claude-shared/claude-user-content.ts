import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { MessageAttachment } from "@cocurdex/shared";
import { isDocumentAttachment, isImageAttachment } from "@cocurdex/shared";
import {
  buildTextWithContextAttachments,
  readAttachmentBase64,
  readImageAttachmentBase64,
} from "../shared";

type ClaudeUserContent = SDKUserMessage["message"]["content"];

// Media types the Anthropic image content block accepts. Anything else stays a
// text summary so the model at least learns the attachment exists.
const SUPPORTED_IMAGE_MEDIA_TYPES = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];

function isSupportedImageMediaType(
  value: string,
): value is SupportedImageMediaType {
  return (SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

function isInlineImageAttachment(attachment: MessageAttachment) {
  return (
    isImageAttachment(attachment) &&
    isSupportedImageMediaType(attachment.mimeType)
  );
}

/**
 * Builds the Claude user message content, sending supported images as native
 * image blocks instead of the agent-neutral text summary. Returns the text
 * portion separately so diagnostics keep reporting the prompt length.
 */
export function buildClaudeUserContent(
  content: string,
  attachments: MessageAttachment[],
): { content: ClaudeUserContent; text: string } {
  const inlineImages = attachments
    .filter(isImageAttachment)
    .filter((attachment) => isSupportedImageMediaType(attachment.mimeType));
  const inlineDocuments = attachments.filter(isDocumentAttachment);
  const text = buildTextWithContextAttachments(
    content,
    attachments.filter(
      (attachment) =>
        !isInlineImageAttachment(attachment) &&
        !isDocumentAttachment(attachment),
    ),
  );

  if (inlineImages.length === 0 && inlineDocuments.length === 0) {
    return { content: text, text };
  }

  const imageBlocks = inlineImages.flatMap((attachment) =>
    isSupportedImageMediaType(attachment.mimeType)
      ? [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: attachment.mimeType,
              data: readImageAttachmentBase64(attachment),
            },
          },
        ]
      : [],
  );
  const documentBlocks = inlineDocuments.map((attachment) => ({
    source: {
      data: readAttachmentBase64(attachment),
      media_type: attachment.mimeType,
      type: "base64" as const,
    },
    type: "document" as const,
  }));

  return {
    content: [
      ...imageBlocks,
      ...documentBlocks,
      {
        type: "text" as const,
        text: text || "Please analyze the attached content.",
      },
    ],
    text,
  };
}
