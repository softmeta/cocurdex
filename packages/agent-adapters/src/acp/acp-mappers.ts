import { pathToFileURL } from "node:url";
import type {
  ContentBlock,
  InitializeResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type {
  AgentNegotiatedCapabilities,
  AgentPermissionDecision,
  MessageAttachment,
} from "@cocurdex/shared";
import {
  buildTextWithContextAttachments,
  readAttachmentBase64,
  readImageAttachmentBase64,
  splitAttachments,
} from "../shared/attachment-utils";

export function mapNegotiatedCapabilities(
  response: InitializeResponse,
): AgentNegotiatedCapabilities {
  const prompt = response.agentCapabilities?.promptCapabilities;
  return {
    protocol: {
      kind: "acp",
      version: response.protocolVersion,
    },
    loadSession: response.agentCapabilities?.loadSession ?? false,
    resumeSession:
      response.agentCapabilities?.sessionCapabilities?.resume != null,
    prompt: {
      audio: prompt?.audio ?? false,
      embeddedContext: prompt?.embeddedContext ?? false,
      image: prompt?.image ?? false,
    },
  };
}

export function mapPermissionDecision(
  request: RequestPermissionRequest,
  decision: AgentPermissionDecision,
): RequestPermissionResponse {
  const option =
    decision === "cancelled"
      ? undefined
      : request.options.find((candidate) => candidate.kind === decision);
  return option
    ? {
        outcome: {
          outcome: "selected",
          optionId: option.optionId,
        },
      }
    : { outcome: { outcome: "cancelled" } };
}

export function rejectPermission(
  request: RequestPermissionRequest,
): RequestPermissionResponse {
  return mapPermissionDecision(request, "reject_once");
}

export async function buildAcpPrompt(
  content: string,
  attachments: MessageAttachment[],
  capabilities: AgentNegotiatedCapabilities,
): Promise<ContentBlock[]> {
  const { documents, images } = splitAttachments(attachments);
  const text = buildTextWithContextAttachments(content, attachments, {
    includeImageSummaries: !capabilities.prompt.image,
  });
  const prompt: ContentBlock[] = [
    {
      type: "text",
      text: text || "Please analyze the attached content.",
    },
  ];

  for (const document of documents) {
    const uri = pathToFileURL(document.filePath).href;
    if (capabilities.prompt.embeddedContext) {
      prompt.push({
        resource: {
          blob: readAttachmentBase64(document),
          mimeType: document.mimeType,
          uri,
        },
        type: "resource",
      });
      continue;
    }

    prompt.push({
      mimeType: document.mimeType,
      name: document.name,
      size: document.sizeBytes,
      type: "resource_link",
      uri,
    });
  }

  if (capabilities.prompt.image) {
    for (const image of images) {
      prompt.push({
        type: "image",
        data: readImageAttachmentBase64(image),
        mimeType: image.mimeType,
        uri: pathToFileURL(image.filePath).href,
      });
    }
  }
  return prompt;
}
