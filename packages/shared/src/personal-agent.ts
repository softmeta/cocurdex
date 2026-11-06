import type { AgentRoleRecord, SaveAgentRolePayload } from "./agent-role";
import { isChatWorkspaceId } from "./chat-session";
import type { AgentId, SessionRecord } from "./contracts";

export const PERSONAL_WORKSPACE_ID = "personal";
export const PERSONAL_AGENT_SOUL_MAX_LENGTH = 20_000;
export const PERSONAL_AGENT_RUNTIME_ID: AgentId = "pi";

export interface PersonalAgentRecord {
  id: string;
  role: AgentRoleRecord;
  homeSessionId: string;
  soul: string | null;
  isDefault: boolean;
  pinnedAt: string | null;
  mutedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PersonalAgentRolePayload = Omit<SaveAgentRolePayload, "id">;

export interface CreatePersonalAgentPayload {
  role: PersonalAgentRolePayload;
  soul?: string | null;
}

export interface EnsureDefaultPersonalAgentPayload {
  name: string;
  description?: string | null;
}

export interface UpdatePersonalAgentPayload {
  id: string;
  role?: PersonalAgentRolePayload;
  soul?: string | null;
  pinned?: boolean;
  muted?: boolean;
  sortOrder?: number;
}

export interface DuplicatePersonalAgentPayload {
  id: string;
  name: string;
}

export function personalAgentRoleDraft(name: string): PersonalAgentRolePayload {
  return {
    name,
    agentId: PERSONAL_AGENT_RUNTIME_ID,
    providerId: null,
    modelId: null,
    modelName: null,
    permissionMode: null,
    sessionModeId: null,
    reasoningEffort: null,
    serviceTier: null,
    fastMode: null,
    thinkingLevel: null,
    openCodeAgent: null,
    openCodeVariant: null,
  };
}

export function assertPersonalAgentRuntime(agentId: AgentId) {
  if (agentId !== PERSONAL_AGENT_RUNTIME_ID) {
    throw new Error(
      `Personal agents run on ${PERSONAL_AGENT_RUNTIME_ID}, not ${agentId}`,
    );
  }
}

export function isPersonalWorkspaceId(workspaceId: string) {
  return workspaceId === PERSONAL_WORKSPACE_ID;
}

export function isFormWorkspaceId(workspaceId: string) {
  return isChatWorkspaceId(workspaceId) || isPersonalWorkspaceId(workspaceId);
}

export function isPersonalSession(session: Pick<SessionRecord, "sessionKind">) {
  return session.sessionKind === "personal";
}

export function normalizePersonalAgentSoul(soul: string | null | undefined) {
  const trimmed = soul?.trim().slice(0, PERSONAL_AGENT_SOUL_MAX_LENGTH);
  return trimmed || null;
}

export function comparePersonalAgents(
  left: PersonalAgentRecord,
  right: PersonalAgentRecord,
) {
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
  const leftPinned = left.pinnedAt !== null;
  if (leftPinned !== (right.pinnedAt !== null)) return leftPinned ? -1 : 1;
  if (left.sortOrder !== right.sortOrder)
    return left.sortOrder - right.sortOrder;
  return left.createdAt.localeCompare(right.createdAt);
}
