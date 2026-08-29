import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type {
  AgentPermissionDecision,
  AgentPermissionRequestPayload,
  AgentToolCallLocation,
} from "@cocurdex/shared";
import { createPermissionOptions } from "../shared";
import type { CodexAppServerRequest } from "./codex-app-server-client";
import { isRecord } from "./codex-app-server-events";

const legacyApprovalMethods = new Set([
  "applyPatchApproval",
  "execCommandApproval",
]);

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getLocations(input: unknown): AgentToolCallLocation[] {
  if (!isRecord(input)) {
    return [];
  }

  if (Array.isArray(input.changes)) {
    return input.changes.flatMap((change) => {
      if (!isRecord(change)) {
        return [];
      }

      const path = getString(change.path);
      return path ? [{ path }] : [];
    });
  }

  const path = getString(input.path) ?? getString(input.filePath);
  return path ? [{ path }] : [];
}

function getPermissionTitle(request: CodexAppServerRequest) {
  if (!isRecord(request.params)) {
    return request.method;
  }

  const item = isRecord(request.params.item) ? request.params.item : null;
  const command =
    getString(request.params.command) ??
    (item ? getString(item.command) : null);
  if (command) {
    return command;
  }

  const path =
    getString(request.params.path) ?? getString(request.params.filePath);
  if (path) {
    return path;
  }

  if (item && Array.isArray(item.changes)) {
    const files = item.changes
      .flatMap((change) =>
        isRecord(change) && typeof change.path === "string"
          ? [change.path]
          : [],
      )
      .join(", ");
    if (files) {
      return files;
    }
  }

  const reason = getString(request.params.reason);
  if (reason) {
    return reason;
  }

  return request.method;
}

function getPermissionKind(method: string) {
  if (
    method === "item/commandExecution/requestApproval" ||
    method === "execCommandApproval"
  ) {
    return "command";
  }

  if (
    method === "item/fileChange/requestApproval" ||
    method === "applyPatchApproval"
  ) {
    return "file_change";
  }

  return "other";
}

function mapCodexDecision(method: string, decision: AgentPermissionDecision) {
  if (legacyApprovalMethods.has(method)) {
    return {
      decision: decision.startsWith("allow") ? "approved" : "denied",
    };
  }

  if (!decision.startsWith("allow")) {
    return { decision: "decline" };
  }

  return {
    decision: decision === "allow_always" ? "acceptForSession" : "accept",
  };
}

// Maps a permission escalation request (item/permissions/requestApproval) to
// the PermissionsRequestApprovalResponse shape: grant the requested profile on
// allow, grant nothing on deny.
function mapCodexPermissionsProfileDecision(
  params: unknown,
  decision: AgentPermissionDecision,
) {
  if (!decision.startsWith("allow")) {
    return { permissions: {}, scope: "turn" };
  }

  const requested =
    isRecord(params) && isRecord(params.permissions) ? params.permissions : {};

  return {
    permissions: {
      ...(requested.network !== null && requested.network !== undefined
        ? { network: requested.network }
        : {}),
      ...(requested.fileSystem !== null && requested.fileSystem !== undefined
        ? { fileSystem: requested.fileSystem }
        : {}),
    },
    scope: decision === "allow_always" ? "session" : "turn",
  };
}

export function canHandleCodexPermissionRequest(method: string) {
  return (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval" ||
    method === "item/permissions/requestApproval" ||
    method === "execCommandApproval" ||
    method === "applyPatchApproval"
  );
}

export async function requestCodexPermission(
  payload: CreateAgentSessionPayload,
  request: CodexAppServerRequest,
) {
  if (!canHandleCodexPermissionRequest(request.method)) {
    throw new Error(`Unsupported app-server request: ${request.method}`);
  }

  const permissionRequest: AgentPermissionRequestPayload = {
    sessionId: payload.session.id,
    providerId: payload.session.agentType,
    kind: getPermissionKind(request.method),
    title: getPermissionTitle(request),
    description: request.method,
    rawInput: request.params,
    locations: getLocations(request.params),
    options: createPermissionOptions(
      legacyApprovalMethods.has(request.method)
        ? ["reject_once", "allow_once"]
        : ["reject_once", "allow_always", "allow_once"],
    ),
  };
  const decision =
    (await payload.requestPermission?.(permissionRequest)) ?? "reject_once";

  if (request.method === "item/permissions/requestApproval") {
    return mapCodexPermissionsProfileDecision(request.params, decision);
  }

  return mapCodexDecision(request.method, decision);
}
