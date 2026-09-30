import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type {
  AgentPermissionDecision,
  AgentPermissionRequestPayload,
  AgentToolCallLocation,
} from "@cocurdex/shared";
import type {
  OpenCodeClient,
  PermissionAsked,
  PermissionReply,
} from "@opencode/client";
import { createPermissionOptions } from "../shared";

export type OpenCodePermission = PermissionAsked["data"];

function getLocations(permission: OpenCodePermission): AgentToolCallLocation[] {
  const files = permission.metadata?.files;
  if (!Array.isArray(files)) {
    return [];
  }

  return files.flatMap((file) =>
    file && typeof file === "object" && typeof file.file === "string"
      ? [{ path: file.file }]
      : [],
  );
}

export function createOpenCodePermissionRequest(
  payload: CreateAgentSessionPayload,
  permission: OpenCodePermission,
): AgentPermissionRequestPayload {
  return {
    id: permission.id,
    sessionId: payload.session.id,
    providerId: payload.session.agentType,
    kind: permission.action,
    title: permission.message ?? permission.action,
    description:
      permission.resources.length > 0
        ? `Resources: ${permission.resources.join(", ")}`
        : null,
    rawInput: permission,
    locations: getLocations(permission),
    options: createPermissionOptions([
      "reject_once",
      "allow_always",
      "allow_once",
    ]),
  };
}

export function mapOpenCodeDecision(
  decision: AgentPermissionDecision,
): PermissionReply {
  if (!decision.startsWith("allow")) return "reject";
  return decision === "allow_always" ? "always" : "once";
}

export function mapOpenCodeReply(
  reply: PermissionReply,
): AgentPermissionDecision {
  if (reply === "reject") return "reject_once";
  return reply === "always" ? "allow_always" : "allow_once";
}

type PermissionMode = CreateAgentSessionPayload["session"]["permissionMode"];

async function decideOpenCodePermission(
  payload: CreateAgentSessionPayload,
  permission: OpenCodePermission,
  permissionMode: PermissionMode,
): Promise<AgentPermissionDecision> {
  if (permissionMode === "opencode-allow") return "allow_once";
  if (permissionMode === "opencode-deny") return "reject_once";

  const resolution = await payload.requestPermission?.(
    createOpenCodePermissionRequest(payload, permission),
  );
  return resolution?.decision ?? "reject_once";
}

export async function replyOpenCodePermission(
  payload: CreateAgentSessionPayload,
  client: OpenCodeClient,
  permission: OpenCodePermission,
  permissionMode: PermissionMode,
) {
  const decision = await decideOpenCodePermission(
    payload,
    permission,
    permissionMode,
  );
  await client.permission.reply({
    sessionID: permission.sessionID,
    requestID: permission.id,
    decision: mapOpenCodeDecision(decision),
  });
}
