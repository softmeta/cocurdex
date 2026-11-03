import {
  type AgentId,
  type AgentPermissionModeOption,
  type AgentSessionRuntimeState,
  type HostPrincipal,
  isAttendedConfigChange,
  isAttendedSessionMode,
  principalHasScope,
  type SessionRecord,
  sessionRunsUnattended,
  UNATTENDED_EXECUTION_SCOPE,
} from "@cocurdex/shared";

export interface UnattendedExecutionLookup {
  session(sessionId: string): Promise<SessionRecord | null>;
  runtimeState(sessionId: string): AgentSessionRuntimeState | undefined;
  permissionModes(agentId: AgentId): Promise<AgentPermissionModeOption[]>;
}

type Params = Record<string, unknown>;

const SESSION_DRIVING_METHODS: Readonly<Record<string, string>> = {
  "session.send": "sessionId",
  "session.resumeQueued": "sessionId",
  "session.updateQueued": "sessionId",
  "session.steerQueued": "sessionId",
  "session.sendQueuedNow": "sessionId",
  "session.sendPeerMessage": "toSessionId",
};

function readString(params: Params, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

async function drivesUnattendedSession(
  sessionId: string,
  lookup: UnattendedExecutionLookup,
) {
  const session = await lookup.session(sessionId);
  if (!session) return false;
  const runtime = lookup.runtimeState(sessionId);
  if (!sessionRunsUnattended(session, [], runtime)) return false;
  if (!session.permissionMode) return true;
  return sessionRunsUnattended(
    session,
    await lookup.permissionModes(session.agentType),
    runtime,
  );
}

function setsUnattendedConfig(
  params: Params,
  lookup: UnattendedExecutionLookup,
) {
  const sessionId = readString(params, "sessionId");
  const configId = readString(params, "configId");
  const value = params.value;
  if (!sessionId || !configId) return false;
  if (typeof value !== "string" && typeof value !== "boolean") return false;
  const option = lookup
    .runtimeState(sessionId)
    ?.configOptions.find((candidate) => candidate.id === configId);
  return !isAttendedConfigChange(option, value);
}

export async function requestRunsUnattended(
  method: string,
  params: unknown,
  lookup: UnattendedExecutionLookup,
) {
  if (!params || typeof params !== "object") return false;
  const record = params as Params;
  if (method === "session.setMode") {
    const modeId = readString(record, "modeId");
    return modeId !== null && !isAttendedSessionMode(modeId);
  }
  if (method === "session.setConfig") {
    return setsUnattendedConfig(record, lookup);
  }
  const sessionKey = SESSION_DRIVING_METHODS[method];
  if (!sessionKey) return false;
  const sessionId = readString(record, sessionKey);
  return sessionId !== null && drivesUnattendedSession(sessionId, lookup);
}

export async function mayRunUnattended(
  principal: HostPrincipal,
  method: string,
  params: unknown,
  lookup: UnattendedExecutionLookup,
) {
  if (principalHasScope(principal, UNATTENDED_EXECUTION_SCOPE)) return true;
  return !(await requestRunsUnattended(method, params, lookup));
}
