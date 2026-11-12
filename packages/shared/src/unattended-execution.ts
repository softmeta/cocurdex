import { getFallbackAgentPermissionModes } from "./agent-permission-modes";
import { getAgentTraits } from "./agent-traits";
import { isChatSession } from "./chat-session";
import {
  type AgentPermissionModeOption,
  type AgentSessionConfigOption,
  PLAN_MODE_ID,
  type SessionRecord,
} from "./contracts";
import type { HostAccessScope } from "./host-access";
import type { AgentSessionRuntimeState } from "./session-runtime/session-runtime-state";

export const UNATTENDED_EXECUTION_SCOPE: HostAccessScope = "execute";

const ATTENDED_SESSION_MODE_IDS: ReadonlySet<string> = new Set([
  "default",
  PLAN_MODE_ID,
]);
const ATTENDED_CONFIG_CATEGORIES: ReadonlySet<string> = new Set([
  "model",
  "thought_level",
]);
const MODE_CONFIG_CATEGORY = "mode";

export type UnattendedSessionFacts = Pick<
  SessionRecord,
  "agentType" | "sessionKind" | "permissionMode" | "sessionModeId"
>;

export function isAttendedSessionMode(modeId: string) {
  return ATTENDED_SESSION_MODE_IDS.has(modeId);
}

export function isAttendedPermissionMode(
  permissionMode: string,
  options: readonly AgentPermissionModeOption[],
) {
  const option = options.find((candidate) => candidate.id === permissionMode);
  return option?.risk === "normal" || option?.risk === "elevated";
}

export function isAttendedConfigChange(
  option: AgentSessionConfigOption | undefined,
  value: boolean | string,
) {
  const category = option?.category;
  if (!category) return false;
  if (ATTENDED_CONFIG_CATEGORIES.has(category)) return true;
  return (
    category === MODE_CONFIG_CATEGORY &&
    typeof value === "string" &&
    isAttendedSessionMode(value)
  );
}

function liveModeIds(runtime: AgentSessionRuntimeState | null | undefined) {
  if (!runtime) return [];
  const configModes = runtime.configOptions
    .filter((option) => option.category === MODE_CONFIG_CATEGORY)
    .map((option) => option.currentValue);
  const currentMode = runtime.mode ? [runtime.mode.currentModeId] : [];
  return [...currentMode, ...configModes];
}

export function sessionRunsUnattended(
  session: UnattendedSessionFacts,
  permissionModes: readonly AgentPermissionModeOption[],
  runtime?: AgentSessionRuntimeState | null,
) {
  if (isChatSession(session)) return false;
  if (!getAgentTraits(session.agentType).toolApprovals) return true;
  if (
    session.permissionMode &&
    !isAttendedPermissionMode(session.permissionMode, [
      ...getFallbackAgentPermissionModes(session.agentType),
      ...permissionModes,
    ])
  ) {
    return true;
  }
  if (session.sessionModeId && !isAttendedSessionMode(session.sessionModeId)) {
    return true;
  }
  return liveModeIds(runtime).some(
    (modeId) => typeof modeId !== "string" || !isAttendedSessionMode(modeId),
  );
}
