import {
  type AgentProviderSnapshot,
  hostForLog,
  type MessageAttachment,
} from "@cocurdex/shared";

export function summarizeAttachmentForLog(attachment: MessageAttachment) {
  if (attachment.kind === "image") {
    return {
      height: attachment.height,
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width,
    };
  }

  if (attachment.kind === "context-folder") {
    return {
      kind: attachment.kind,
    };
  }

  if (attachment.kind === "document") {
    return {
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  if (attachment.kind === "context-item") {
    return {
      bodyLength: attachment.body.length,
      itemKind: attachment.itemKind,
      kind: attachment.kind,
    };
  }

  return {
    endLine: attachment.endLine,
    kind: attachment.kind ?? "context-file",
    language: attachment.language,
    selectedTextLength: attachment.selectedText.length,
    startLine: attachment.startLine,
    surroundingContextLength: attachment.surroundingContext.length,
  };
}

export function summarizeProviderSnapshotForLog(
  snapshot: AgentProviderSnapshot | null | undefined,
) {
  if (!snapshot) {
    return null;
  }

  return {
    api: snapshot.api,
    endpointHost: hostForLog(snapshot.baseUrl),
    modelEndpointHost: hostForLog(snapshot.modelBaseUrl),
    modelId: snapshot.modelId,
    modelName: snapshot.modelName,
    providerId: snapshot.providerId,
    providerName: snapshot.providerName,
    reasoningEffort: snapshot.reasoningEffort ?? null,
    serviceTier: snapshot.serviceTier ?? null,
    thinkingLevel: snapshot.thinkingLevel ?? null,
    supportsReasoning: snapshot.supportsReasoning ?? null,
  };
}
