import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type {
  AgentPermissionDecision,
  AgentPermissionRequestPayload,
  AgentToolCallLocation,
} from "@cocurdex/shared";
import { createPermissionOptions } from "../shared";

export interface OpenCodePermission {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    created: number;
  };
}

function getLocations(permission: OpenCodePermission): AgentToolCallLocation[] {
  const path =
    typeof permission.metadata.path === "string"
      ? permission.metadata.path
      : typeof permission.metadata.file === "string"
        ? permission.metadata.file
        : null;

  return path ? [{ path }] : [];
}

export function createOpenCodePermissionRequest(
  payload: CreateAgentSessionPayload,
  permission: OpenCodePermission,
): AgentPermissionRequestPayload {
  return {
    id: permission.id,
    sessionId: payload.session.id,
    providerId: payload.session.agentType,
    kind: permission.type,
    title: permission.title,
    description: permission.pattern
      ? `Pattern: ${Array.isArray(permission.pattern) ? permission.pattern.join(", ") : permission.pattern}`
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

export function mapOpenCodeDecision(decision: AgentPermissionDecision) {
  return !decision.startsWith("allow")
    ? "reject"
    : decision === "allow_always"
      ? "always"
      : "once";
}
