import type { MessageAttachment } from "@cocurdex/shared";
import {
  buildTextWithContextAttachments,
  getAttachmentFilename,
  readAttachmentDataUrl,
  splitAttachments,
} from "../shared";

export function buildPrompt(
  content: string,
  attachments: MessageAttachment[],
  options?: { includeImageSummaries?: boolean },
): string {
  return buildTextWithContextAttachments(content, attachments, options);
}

export function buildPromptInput(
  content: string,
  attachments: MessageAttachment[],
) {
  const { documents, images } = splitAttachments(attachments);
  const text =
    buildPrompt(content, attachments, { includeImageSummaries: false }) ||
    "Please analyze the attached content.";

  return {
    text,
    files: [...images, ...documents].map((attachment) => ({
      uri: readAttachmentDataUrl(attachment),
      name: getAttachmentFilename(attachment),
    })),
  };
}
