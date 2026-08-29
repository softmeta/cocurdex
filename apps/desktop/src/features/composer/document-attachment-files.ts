import type { AgentId, DocumentAttachment } from "@cocurdex/shared";
import type { ImportDocumentAttachmentPayload } from "@/lib";
import { desktopApi } from "@/lib";

export const DOCUMENT_ATTACHMENT_ACCEPT = "application/pdf";
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const DOCUMENT_ATTACHMENT_AGENT_IDS = new Set<AgentId>([
  "claude-agent",
  "grok-build",
  "opencode",
]);

export function supportsDocumentAttachments(agentId: AgentId) {
  return DOCUMENT_ATTACHMENT_AGENT_IDS.has(agentId);
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Unable to read PDF document"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read PDF document"));
        return;
      }
      resolve(reader.result);
    };

    reader.readAsDataURL(file);
  });
}

async function fileToPayload(
  file: File,
): Promise<ImportDocumentAttachmentPayload> {
  return {
    dataUrl: await readFileAsDataUrl(file),
    mimeType: DOCUMENT_ATTACHMENT_ACCEPT,
    name: file.name,
    sizeBytes: file.size,
  };
}

export async function importDocumentFiles(files: File[]) {
  const attachments: DocumentAttachment[] = [];

  for (const file of files) {
    attachments.push(
      await desktopApi.importDocumentAttachment(await fileToPayload(file)),
    );
  }

  return attachments;
}
