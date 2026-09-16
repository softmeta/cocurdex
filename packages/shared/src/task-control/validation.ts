import { isAgentId } from "../agent-role";
import { providerApis, reasoningEfforts } from "../contracts";
import type {
  SendSessionCommand,
  SessionConfiguration,
  SubmitPreviousMessageCommand,
} from "./types";

function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
}

function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unexpected field: ${key}`);
  }
}

function text(value: unknown, name: string, max = 4096, empty = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    value.includes("\0") ||
    (!empty && !value.trim())
  ) {
    throw new Error(`Invalid ${name}`);
  }
}

export function validateSessionId(value: unknown): asserts value is string {
  text(value, "session ID", 256);
  if (
    typeof value === "string" &&
    (value === "." || value === ".." || /[/\\]/.test(value))
  )
    throw new Error("Invalid session ID");
}

function optionalText(value: unknown, name: string) {
  if (value !== undefined && value !== null) text(value, name, 200_000, true);
}

function provider(value: unknown) {
  if (value === undefined || value === null) return;
  record(value);
  const strings = [
    "providerId",
    "providerName",
    "modelId",
    "modelName",
    "api",
    "baseUrl",
    "modelBaseUrl",
    "headersJson",
    "providerCompatJson",
    "modelCompatJson",
    "modelCostJson",
    "modelThinkingLevelMapJson",
    "reasoningEffort",
    "thinkingLevel",
    "modelDefaultReasoningEffort",
    "serviceTier",
    "openCodeAgent",
    "openCodeVariant",
  ];
  const numbers = ["modelContextWindow", "modelMaxTokens"];
  const booleans = ["supportsReasoning", "fastMode"];
  keys(value, [
    ...strings,
    ...numbers,
    ...booleans,
    "modelCapabilities",
    "supportedReasoningEfforts",
  ]);
  for (const name of [
    "providerId",
    "providerName",
    "modelId",
    "modelName",
    "baseUrl",
  ])
    text(value[name], name, 4096, name !== "providerId");
  if (!providerApis.includes(value.api as never))
    throw new Error("Invalid provider API");
  for (const name of strings) optionalText(value[name], name);
  for (const name of numbers) {
    const item = value[name];
    if (
      item != null &&
      (typeof item !== "number" || !Number.isFinite(item) || item < 0)
    )
      throw new Error(`Invalid ${name}`);
  }
  for (const name of booleans)
    if (value[name] != null && typeof value[name] !== "boolean")
      throw new Error(`Invalid ${name}`);
  for (const name of ["modelCapabilities", "supportedReasoningEfforts"]) {
    const items = value[name];
    if (items === undefined) continue;
    if (!Array.isArray(items) || items.length > 100)
      throw new Error(`Invalid ${name}`);
    for (const item of items) {
      if (name === "modelCapabilities") text(item, name, 128);
      else {
        record(item);
        text(item.reasoningEffort, "reasoning effort", 128);
        text(item.description, "reasoning effort description", 4096, true);
        optionalText(item.label, "reasoning effort label");
      }
    }
  }
}

export function validateSessionConfiguration(
  value: unknown,
): asserts value is SessionConfiguration {
  record(value);
  keys(value, [
    "id",
    "workspaceId",
    "title",
    "agentType",
    "writeMode",
    "collaborationMode",
    "permissionMode",
    "agentRoleId",
    "providerSnapshot",
    "worktreePath",
    "peerInbound",
  ]);
  validateSessionId(value.id);
  if (
    value.peerInbound !== undefined &&
    value.peerInbound !== "deliver" &&
    value.peerInbound !== "refuse"
  )
    throw new Error("Invalid peer inbound policy");
  validateSessionId(value.workspaceId);
  text(value.title, "title", 4096, true);
  if (typeof value.agentType !== "string" || !isAgentId(value.agentType))
    throw new Error("Invalid agent type");
  if (value.writeMode !== "read-only" && value.writeMode !== "native-write")
    throw new Error("Invalid write mode");
  if (
    value.collaborationMode !== "default" &&
    value.collaborationMode !== "plan"
  )
    throw new Error("Invalid collaboration mode");
  for (const name of ["permissionMode", "agentRoleId", "worktreePath"])
    optionalText(value[name], name);
  provider(value.providerSnapshot);
}

function validateMessageOrigin(value: unknown) {
  record(value);
  keys(value, ["kind", "sessionId", "sessionTitle"]);
  if (value.kind !== "peer") throw new Error("Invalid message origin");
  validateSessionId(value.sessionId);
  text(value.sessionTitle, "origin session title", 4096, true);
}

export function validateSendSessionCommand(
  value: unknown,
): asserts value is SendSessionCommand {
  record(value);
  keys(value, [
    "sessionId",
    "messageId",
    "createdAt",
    "content",
    "attachments",
    "thinkingLevel",
    "delivery",
    "origin",
  ]);
  validateSessionId(value.sessionId);
  if (value.origin !== undefined) validateMessageOrigin(value.origin);
  if (value.messageId !== undefined) validateSessionId(value.messageId);
  text(value.content, "message content", 200_000, true);
  if (value.createdAt !== undefined) {
    text(value.createdAt, "message timestamp", 64);
    if (!Number.isFinite(Date.parse(value.createdAt as string)))
      throw new Error("Invalid message timestamp");
  }
  if (
    value.delivery !== undefined &&
    !["start-new-run", "steer-active-run", "queue-after-run"].includes(
      value.delivery as string,
    )
  )
    throw new Error("Invalid delivery mode");
  if (
    value.thinkingLevel !== undefined &&
    !["default", "off", ...reasoningEfforts].includes(
      value.thinkingLevel as string,
    )
  )
    throw new Error("Invalid thinking level");
  if (value.attachments !== undefined) {
    if (!Array.isArray(value.attachments) || value.attachments.length > 100)
      throw new Error("Invalid attachments");
    for (const attachment of value.attachments) {
      record(attachment);
      if (attachment.kind === "context-folder")
        text(attachment.folderPath, "folder path");
      else {
        text(attachment.filePath, "attachment path");
        if (attachment.kind === "image" || attachment.kind === "document") {
          text(attachment.id, "attachment ID", 256);
          text(attachment.name, "attachment name");
          text(attachment.mimeType, "attachment MIME type", 256);
          if (
            typeof attachment.sizeBytes !== "number" ||
            !Number.isFinite(attachment.sizeBytes) ||
            attachment.sizeBytes < 0
          )
            throw new Error("Invalid attachment size");
        } else if (
          attachment.kind === undefined ||
          attachment.kind === "context-file"
        ) {
          text(attachment.language, "attachment language", 256, true);
          text(attachment.selectedText, "selected text", 200_000, true);
          text(
            attachment.surroundingContext,
            "surrounding context",
            200_000,
            true,
          );
        } else throw new Error("Invalid attachment kind");
      }
    }
  }
  if (
    !(value.content as string).trim() &&
    !(value.attachments as unknown[] | undefined)?.length
  )
    throw new Error("Message must contain text or attachments");
}

export function validateSubmitPreviousMessageCommand(
  value: unknown,
): asserts value is SubmitPreviousMessageCommand {
  record(value);
  keys(value, [
    "sessionId",
    "messageId",
    "content",
    "attachments",
    "revertWorkspace",
  ]);
  const { revertWorkspace, ...message } = value;
  if (typeof revertWorkspace !== "boolean")
    throw new Error("Invalid workspace revert choice");
  validateSessionId(message.messageId);
  validateSendSessionCommand(message);
}
