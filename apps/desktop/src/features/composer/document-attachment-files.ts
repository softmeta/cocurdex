import {
  type AgentId,
  type DocumentAttachment,
  getAcpAgentProfile,
} from "@cocurdex/shared";
import { desktopApi } from "@/lib";

export const DOCUMENT_ATTACHMENT_ACCEPT = "application/pdf";
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
export function supportsDocumentAttachments(agentId: AgentId) {
  return (
    agentId === "claude-agent" ||
    agentId === "opencode" ||
    getAcpAgentProfile(agentId).documentAttachments === true
  );
}

export function isSupportedDocumentFile(file: File) {
  return file.type === DOCUMENT_ATTACHMENT_ACCEPT;
}

export function getDocumentAttachmentValidationError(file: File) {
  if (!isSupportedDocumentFile(file)) {
    return "Only PDF documents are supported.";
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return "PDF documents must be 32 MB or smaller.";
  }

  return null;
}

export async function importDocumentFiles(files: File[]) {
  const attachments: DocumentAttachment[] = [];

  for (const file of files) {
    attachments.push(
      await desktopApi.importDocumentAttachment(file, file.name),
    );
  }

  return attachments;
}
