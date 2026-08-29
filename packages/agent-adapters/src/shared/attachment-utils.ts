import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  ContextFileAttachment,
  ContextFolderAttachment,
  DocumentAttachment,
  ImageAttachment,
  MessageAttachment,
  MessageRecord,
} from "@cocurdex/shared";
import {
  isContextFileAttachment,
  isContextFolderAttachment,
  isDocumentAttachment,
  isImageAttachment,
} from "@cocurdex/shared";
import { logAdapterDiagnostic } from "../diagnostics";

export function splitAttachments(attachments: MessageAttachment[]) {
  return {
    contextFiles: attachments.filter(isContextFileAttachment),
    contextFolders: attachments.filter(isContextFolderAttachment),
    documents: attachments.filter(isDocumentAttachment),
    images: attachments.filter(isImageAttachment),
  };
}

export function assertNoDocumentAttachments(
  adapterLabel: string,
  attachments: MessageAttachment[],
) {
  if (attachments.some(isDocumentAttachment)) {
    throw new Error(`${adapterLabel} does not support document attachments`);
  }
}

function stripCommonIndent(body: string) {
  const tabstop = 2;
  const lines = body.replace(/\t/g, " ".repeat(tabstop)).split("\n");
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)?.[0].length ?? 0);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;

  return indent > 0
    ? lines.map((line) => line.slice(indent)).join("\n")
    : lines.join("\n");
}

function formatRange(attachment: ContextFileAttachment) {
  const { endColumn, endLine, startColumn, startLine } = attachment;
  const hasColumns =
    typeof startColumn === "number" && typeof endColumn === "number";

  if (!hasColumns) {
    return startLine === endLine
      ? `:L${startLine}`
      : `:L${startLine}-L${endLine}`;
  }

  const displayedEndColumn = Math.max(1, endColumn - 1);

  return startLine === endLine
    ? `:L${startLine}:C${startColumn}-C${displayedEndColumn}`
    : `:L${startLine}:C${startColumn}-L${endLine}:C${displayedEndColumn}`;
}

function escapeXmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeCdata(value: string) {
  return value.replaceAll("]]>", "]]]]><![CDATA[>");
}

function formatOmittedContextFileXml(attachment: ContextFileAttachment) {
  return `<context_file path="${escapeXmlAttribute(
    attachment.filePath,
  )}" language="${escapeXmlAttribute(attachment.language)}" omitted="true" />`;
}

function formatContextFileXml(attachment: ContextFileAttachment, body: string) {
  const { endColumn, endLine, filePath, language, startColumn, startLine } =
    attachment;
  const displayedEndColumn =
    typeof endColumn === "number" ? Math.max(1, endColumn - 1) : undefined;
  const columnAttributes =
    typeof startColumn === "number" && typeof displayedEndColumn === "number"
      ? ` start_column="${startColumn}" end_column="${displayedEndColumn}"`
      : "";

  return [
    `<context_file path="${escapeXmlAttribute(filePath)}" language="${escapeXmlAttribute(
      language,
    )}" start_line="${startLine}" end_line="${endLine}"${columnAttributes}>`,
    "<![CDATA[",
    escapeCdata(body),
    "]]>",
    "</context_file>",
  ].join("\n");
}

// Agent-neutral context format: compact Sidekick-style source marker first,
// then structured XML for models that need explicit metadata.
export function formatContextFileAttachments(
  attachments: ContextFileAttachment[],
) {
  return attachments
    .map((attachment) => {
      if (attachment.contentOmitted) {
        return `\n@${attachment.filePath}\n${formatOmittedContextFileXml(
          attachment,
        )}\n`;
      }

      const body = stripCommonIndent(
        attachment.selectedText || attachment.surroundingContext,
      );
      const location = `@${attachment.filePath} ${formatRange(attachment)}`;
      const xml = formatContextFileXml(attachment, body);
      return `\n${location}\n${xml}\n`;
    })
    .join("");
}

export function formatContextFolderAttachments(
  attachments: ContextFolderAttachment[],
) {
  return attachments
    .map(
      (attachment) => `\n<context_folder path="${attachment.folderPath}" />\n`,
    )
    .join("");
}

// Only reached when the agent cannot take images natively (see
// `includeImageSummaries`), and then the path is the sole way it can get at the
// bytes at all — without it the agent knows an image exists and goes hunting
// for it across the filesystem. Agents that do take images natively never see
// this summary, so no local path is disclosed on that route.
export function formatImageAttachmentSummary(attachment: ImageAttachment) {
  return [
    `Image: ${attachment.name}`,
    `Path: ${attachment.filePath}`,
    `MIME: ${attachment.mimeType}`,
    `Size: ${attachment.sizeBytes} bytes`,
    `Dimensions: ${attachment.width}x${attachment.height}`,
  ].join("\n");
}

export function buildTextWithContextAttachments(
  content: string,
  attachments: MessageAttachment[],
  options: { includeImageSummaries?: boolean } = {},
) {
  const { contextFiles, contextFolders, images } =
    splitAttachments(attachments);
  const text = content.trim();
  const contextText = formatContextFileAttachments(contextFiles);
  const folderText = formatContextFolderAttachments(contextFolders);
  const imageSummaries =
    options.includeImageSummaries === false
      ? ""
      : images
          .map(
            (attachment) =>
              `\n--- ${formatImageAttachmentSummary(attachment)} ---\n`,
          )
          .join("");

  return [contextText, folderText, imageSummaries, text]
    .filter(Boolean)
    .join("\n");
}

export function logOutgoingPromptForDiagnostics({
  agentId,
  attachments,
  history = [],
  prompt,
  sessionId,
}: {
  agentId: string;
  attachments: MessageAttachment[];
  history?: MessageRecord[];
  prompt: string;
  sessionId: string;
}) {
  const { contextFiles, contextFolders, documents, images } =
    splitAttachments(attachments);
  const historyByRole = { assistant: 0, system: 0, user: 0 };
  for (const message of history) {
    historyByRole[message.role] += 1;
  }

  logAdapterDiagnostic("info", "[AgentPrompt] outgoing", {
    agentId,
    attachmentCount: attachments.length,
    contextFileCount: contextFiles.length,
    contextFolderCount: contextFolders.length,
    documentCount: documents.length,
    historyAssistantCount: historyByRole.assistant,
    historyAttachmentCount: history.reduce(
      (count, message) => count + message.attachments.length,
      0,
    ),
    historyContentLength: history.reduce(
      (length, message) => length + message.content.length,
      0,
    ),
    historyMessageCount: history.length,
    historySystemCount: historyByRole.system,
    historyUserCount: historyByRole.user,
    imageCount: images.length,
    promptLength: prompt.length,
    sessionId,
  });
}

export function readImageAttachmentBase64(attachment: ImageAttachment) {
  return readAttachmentBase64(attachment);
}

export function readImageAttachmentDataUrl(attachment: ImageAttachment) {
  return `data:${attachment.mimeType};base64,${readImageAttachmentBase64(
    attachment,
  )}`;
}

export function getImageAttachmentFilename(attachment: ImageAttachment) {
  return getAttachmentFilename(attachment);
}

type BinaryAttachment = DocumentAttachment | ImageAttachment;

export function readAttachmentBase64(attachment: BinaryAttachment) {
  return readFileSync(attachment.filePath).toString("base64");
}

export function readAttachmentDataUrl(attachment: BinaryAttachment) {
  return `data:${attachment.mimeType};base64,${readAttachmentBase64(
    attachment,
  )}`;
}

export function getAttachmentFilename(attachment: BinaryAttachment) {
  return attachment.name || path.basename(attachment.filePath);
}
