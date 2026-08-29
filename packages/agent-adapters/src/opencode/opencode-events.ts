import type { MessageAttachment } from "@cocurdex/shared";
import {
  buildTextWithContextAttachments,
  getAttachmentFilename,
  readAttachmentDataUrl,
  splitAttachments,
} from "../shared";

export interface ToolPartState {
  status: string;
  raw?: string;
  input?: unknown;
  title?: string;
  output?: string;
  error?: string;
  content?: unknown;
  structured?: unknown;
  metadata?: Record<string, unknown>;
  time?: {
    start?: number;
    end?: number;
  };
}

export interface MessagePart {
  id: string;
  type: string;
  messageID?: string;
  sessionID?: string;
  text?: string;
  prompt?: string;
  description?: string;
  agent?: string;
  command?: string;
  tool?: string;
  callID?: string;
  state?: ToolPartState;
}

export interface MessagePartDeltaInfo {
  part?: MessagePart;
  sessionID?: string;
  messageID?: string;
  partID?: string;
  type?: string;
  field?: string;
  delta?: string;
}

export type OpenCodeMessageRole = "assistant" | "user";

export interface OpenCodeMessageInfo {
  cost?: number;
  id?: string;
  role?: OpenCodeMessageRole;
  sessionID?: string;
  time?: {
    completed?: number;
    created?: number;
  };
  tokens?: {
    cache?: {
      read?: number;
      write?: number;
    };
    input?: number;
    output?: number;
    reasoning?: number;
    total?: number;
  };
}

export interface PendingTextDelta {
  delta: string;
  messageId: string;
  partId: string;
  sessionId?: string;
}

export interface OpenCodeTextPartState {
  messageId: string;
  part: MessagePart;
}

export interface OpenCodeMessageSnapshot {
  info?: OpenCodeMessageInfo;
  parts: MessagePart[];
}

export interface OpenCodeSessionSnapshot {
  sessionID: string;
  messages: OpenCodeMessageSnapshot[];
}

export interface OpenCodeSessionInfo {
  id: string;
  parentID?: string;
  title?: string;
}

export function previewText(value: string, maxLength = 200) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function buildPrompt(
  content: string,
  attachments: MessageAttachment[],
  options?: { includeImageSummaries?: boolean },
): string {
  return buildTextWithContextAttachments(content, attachments, options);
}

export function buildPromptParts(
  content: string,
  attachments: MessageAttachment[],
) {
  const { documents, images } = splitAttachments(attachments);
  const binaryAttachments = [...images, ...documents];
  const text =
    buildPrompt(content, attachments, { includeImageSummaries: false }) ||
    "Please analyze the attached content.";

  return [
    { text, type: "text" as const },
    ...binaryAttachments.map((attachment) => ({
      filename: getAttachmentFilename(attachment),
      mime: attachment.mimeType,
      type: "file" as const,
      url: readAttachmentDataUrl(attachment),
    })),
  ];
}

export function getOpenCodeEventSessionId(
  properties: Record<string, unknown>,
): string | undefined {
  if (typeof properties.sessionID === "string") {
    return properties.sessionID;
  }

  const part = properties.part;
  if (
    part &&
    typeof part === "object" &&
    "sessionID" in part &&
    typeof part.sessionID === "string"
  ) {
    return part.sessionID;
  }

  const info = properties.info;
  if (
    info &&
    typeof info === "object" &&
    "sessionID" in info &&
    typeof info.sessionID === "string"
  ) {
    return info.sessionID;
  }

  return undefined;
}
