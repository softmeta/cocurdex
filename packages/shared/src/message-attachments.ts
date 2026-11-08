import { pathBaseName } from "./files";

export interface ContextFileAttachment {
  kind?: "context-file";
  filePath: string;
  language: string;
  selectedText: string;
  startLine: number;
  startColumn?: number;
  endLine: number;
  endColumn?: number;
  surroundingContext: string;
  contentOmitted?: boolean;
}

export interface ContextFolderAttachment {
  kind: "context-folder";
  folderPath: string;
}

export interface ContextItemAttachment {
  kind: "context-item";
  itemKind: "note" | "issue";
  id: string;
  title: string;
  body: string;
}

export interface ImageAttachment {
  kind: "image";
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  filePath: string;
  width: number;
  height: number;
}

export interface DocumentAttachment {
  kind: "document";
  id: string;
  name: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  filePath: string;
}

export type MessageAttachment =
  | ContextFileAttachment
  | ContextFolderAttachment
  | ContextItemAttachment
  | ImageAttachment
  | DocumentAttachment;

export function isImageAttachment(
  attachment: MessageAttachment,
): attachment is ImageAttachment {
  return attachment.kind === "image";
}

export function isDocumentAttachment(
  attachment: MessageAttachment,
): attachment is DocumentAttachment {
  return attachment.kind === "document";
}

export function isContextFileAttachment(
  attachment: MessageAttachment,
): attachment is ContextFileAttachment {
  return attachment.kind === undefined || attachment.kind === "context-file";
}

export function isContextFolderAttachment(
  attachment: MessageAttachment,
): attachment is ContextFolderAttachment {
  return attachment.kind === "context-folder";
}

export function isContextItemAttachment(
  attachment: MessageAttachment,
): attachment is ContextItemAttachment {
  return attachment.kind === "context-item";
}

export function getContextItemRef(attachment: ContextItemAttachment) {
  return `${attachment.itemKind}:${attachment.id}`;
}

export type ContextAttachment =
  | ContextFileAttachment
  | ContextFolderAttachment
  | ContextItemAttachment;

export function getContextAttachmentKey(attachment: ContextAttachment) {
  if (isContextItemAttachment(attachment)) {
    return getContextItemRef(attachment);
  }
  if (isContextFolderAttachment(attachment)) {
    return `folder:${attachment.folderPath}`;
  }
  return `file:${attachment.filePath}:${attachment.startLine}:${attachment.endLine}`;
}

export function isContextAttachment(
  attachment: MessageAttachment,
): attachment is ContextAttachment {
  return (
    isContextFileAttachment(attachment) ||
    isContextFolderAttachment(attachment) ||
    isContextItemAttachment(attachment)
  );
}

export function formatContextFileRange(
  attachment: Pick<
    ContextFileAttachment,
    "startLine" | "startColumn" | "endLine" | "endColumn"
  >,
): string {
  const { startLine, startColumn, endLine, endColumn } = attachment;
  if (startColumn !== undefined && endColumn !== undefined) {
    return `L${startLine}:${startColumn}-${endLine}:${endColumn}`;
  }
  return `L${startLine}-${endLine}`;
}

export function formatContextFileChipLabel(
  attachment: Pick<
    ContextFileAttachment,
    | "contentOmitted"
    | "filePath"
    | "startLine"
    | "startColumn"
    | "endLine"
    | "endColumn"
  >,
): string {
  const fileName = pathBaseName(attachment.filePath);
  if (attachment.contentOmitted) {
    return fileName;
  }
  return `${fileName} ${formatContextFileRange(attachment)}`;
}
