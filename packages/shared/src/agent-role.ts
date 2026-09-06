import { getFallbackAgentPermissionModes } from "./agent-permission-modes";
import type {
  AgentId,
  AgentPermissionMode,
  AgentProviderSnapshot,
  AgentThinkingLevel,
  CollaborationModeKind,
  ReasoningEffort,
} from "./contracts";
import type {
  WorkflowExecutorBinding,
  WorkflowPermissionProfile,
  WorkflowRole,
} from "./workflow/types";

export const AGENT_ROLE_NAME_MAX_LENGTH = 80;

const AGENT_IDS: readonly AgentId[] = [
  "claude-agent",
  "codex",
  "grok-build",
  "opencode",
  "pi",
];

const API_BY_AGENT: Partial<Record<AgentId, AgentProviderSnapshot["api"]>> = {
  "claude-agent": "anthropic-messages",
  codex: "openai-responses",
  "grok-build": "openai-responses",
  opencode: "openai-completions",
  pi: "openai-completions",
};

const WORKFLOW_ROLE_PROFILES: Record<WorkflowRole, WorkflowPermissionProfile> =
  {
    planner: "read_only",
    implementer: "workspace_write",
    reviewer: "read_only",
  };

export interface AgentRoleDraft {
  agentId: AgentId;
  providerId: string | null;
  modelId: string | null;
  modelName: string | null;
  permissionMode: AgentPermissionMode | null;
  collaborationMode: CollaborationModeKind;
  reasoningEffort: ReasoningEffort | null;
  serviceTier: string | null;
  fastMode: boolean | null;
  thinkingLevel: AgentThinkingLevel | null;
  openCodeAgent: string | null;
  openCodeVariant: string | null;
}

export interface AgentRoleRecord extends AgentRoleDraft {
  id: string;
  name: string;
  instructions: string | null;
  skillIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveAgentRolePayload extends AgentRoleDraft {
  id?: string;
  name: string;
  instructions?: string | null;
  skillIds?: string[] | null;
}

export function isAgentId(value: string): value is AgentId {
  return AGENT_IDS.includes(value as AgentId);
}

export function normalizeAgentRoleName(name: string) {
  return name.trim().slice(0, AGENT_ROLE_NAME_MAX_LENGTH);
}

export function workflowPermissionProfileForAgentRole(
  role: Pick<AgentRoleDraft, "agentId" | "permissionMode">,
): WorkflowPermissionProfile | null {
  if (!role.permissionMode) {
    return role.agentId === "pi" ? "read_only" : null;
  }

  if (role.permissionMode === "claude-plan") {
    return "read_only";
  }
  if (role.permissionMode === "claude-auto") {
    return "workspace_write";
  }

  const option = getFallbackAgentPermissionModes(role.agentId).find(
    (mode) => mode.id === role.permissionMode,
  );
  if (option?.risk === "normal") {
    return "read_only";
  }
  if (option?.risk === "elevated") {
    return "workspace_write";
  }
  return null;
}

export function projectAgentRoleToExecutorBinding(
  role: AgentRoleRecord,
  workflowRole: WorkflowRole,
): WorkflowExecutorBinding {
  const permissionProfile = workflowPermissionProfileForAgentRole(role);
  const requiredProfile = WORKFLOW_ROLE_PROFILES[workflowRole];
  if (permissionProfile !== requiredProfile) {
    throw new Error(
      `Agent role '${role.name}' cannot bind workflow role '${workflowRole}'.`,
    );
  }

  return {
    agentId: role.agentId,
    agentRoleId: role.id,
    model: role.modelId ?? undefined,
    permissionProfile,
    providerSnapshot: providerSnapshotForAgentRole(role),
    runtime: {
      permissionMode: role.permissionMode,
      collaborationMode: "default",
      reasoningEffort: role.reasoningEffort,
      thinkingLevel: role.thinkingLevel,
      serviceTier: role.serviceTier,
      fastMode: role.fastMode,
      openCodeAgent: role.openCodeAgent,
      openCodeVariant: role.openCodeVariant,
    },
  };
}

export function agentRoleMatchesDraft(
  role: AgentRoleDraft,
  draft: AgentRoleDraft,
): boolean {
  return (
    role.agentId === draft.agentId &&
    sameOptional(role.providerId, draft.providerId) &&
    sameOptional(role.modelId, draft.modelId) &&
    sameOptional(role.permissionMode, draft.permissionMode) &&
    (role.collaborationMode ?? "default") ===
      (draft.collaborationMode ?? "default") &&
    sameOptional(role.reasoningEffort, draft.reasoningEffort) &&
    sameOptional(role.serviceTier, draft.serviceTier) &&
    Boolean(role.fastMode) === Boolean(draft.fastMode) &&
    sameThinkingLevel(role.thinkingLevel, draft.thinkingLevel) &&
    sameOptional(role.openCodeAgent, draft.openCodeAgent) &&
    sameOptional(role.openCodeVariant, draft.openCodeVariant)
  );
}

function providerSnapshotForAgentRole(
  role: AgentRoleDraft,
): AgentProviderSnapshot | undefined {
  if (!role.providerId || !role.modelId) {
    return undefined;
  }

  return {
    providerId: role.providerId,
    providerName: role.agentId,
    modelId: role.modelId,
    modelName: role.modelId,
    api: API_BY_AGENT[role.agentId] ?? "openai-responses",
    baseUrl: "",
    reasoningEffort: role.reasoningEffort,
    thinkingLevel: role.thinkingLevel,
    serviceTier: role.serviceTier,
    fastMode: role.fastMode,
    openCodeAgent: role.openCodeAgent,
    openCodeVariant: role.openCodeVariant,
  };
}

function sameOptional(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return (left || null) === (right || null);
}

function sameThinkingLevel(
  left: AgentThinkingLevel | null | undefined,
  right: AgentThinkingLevel | null | undefined,
) {
  const normalize = (value: AgentThinkingLevel | null | undefined) =>
    !value || value === "default" ? null : value;
  return normalize(left) === normalize(right);
}
