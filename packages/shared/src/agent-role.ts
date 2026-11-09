import { getFallbackAgentPermissionModes } from "./agent-permission-modes";
import {
  AGENT_ROLE_AVATAR_FACES,
  AGENT_ROLE_AVATAR_SHAPES,
  type AgentRoleAvatarFace,
  type AgentRoleAvatarShape,
} from "./agent-role-avatar-shapes";
import {
  type AgentId,
  type AgentPermissionMode,
  type AgentProviderSnapshot,
  type AgentThinkingLevel,
  isAgentId,
  type ReasoningEffort,
} from "./contracts";
import type {
  WorkflowExecutorBinding,
  WorkflowPermissionProfile,
  WorkflowRole,
} from "./workflow/types";

export const AGENT_ROLE_NAME_MAX_LENGTH = 80;
export const AGENT_ROLE_DESCRIPTION_MAX_LENGTH = 500;

export const AGENT_ROLE_AVATAR_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type AgentRoleAvatarColor = (typeof AGENT_ROLE_AVATAR_COLORS)[number];

export type AgentRoleAvatar =
  | { kind: "emoji"; emoji: string; color: AgentRoleAvatarColor }
  | { kind: "initial"; color: AgentRoleAvatarColor }
  | {
      kind: "shape";
      shape: AgentRoleAvatarShape;
      face: AgentRoleAvatarFace;
      color: AgentRoleAvatarColor;
    };

const API_BY_AGENT: Partial<Record<AgentId, AgentProviderSnapshot["api"]>> = {
  "claude-agent": "anthropic-messages",
  codex: "openai-responses",
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
  sessionModeId: string | null;
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
  description: string | null;
  instructions: string | null;
  skillIds: string[] | null;
  avatar: AgentRoleAvatar | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveAgentRolePayload extends AgentRoleDraft {
  id?: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  skillIds?: string[] | null;
  avatar?: AgentRoleAvatar | null;
}

export { isAgentId };

export function normalizeAgentRoleName(name: string) {
  return name.trim().slice(0, AGENT_ROLE_NAME_MAX_LENGTH);
}

export function normalizeAgentRoleDescription(
  description: string | null | undefined,
) {
  const trimmed = description
    ?.trim()
    .slice(0, AGENT_ROLE_DESCRIPTION_MAX_LENGTH);
  return trimmed || null;
}

export function normalizeAgentRoleAvatar(
  value: unknown,
): AgentRoleAvatar | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const {
    kind,
    emoji,
    shape,
    face,
    color: rawColor,
  } = value as Record<string, unknown>;
  const color = AGENT_ROLE_AVATAR_COLORS.includes(
    rawColor as AgentRoleAvatarColor,
  )
    ? (rawColor as AgentRoleAvatarColor)
    : "gray";
  if (kind === "initial") {
    return { kind, color };
  }
  if (kind === "shape") {
    if (!AGENT_ROLE_AVATAR_SHAPES.includes(shape as AgentRoleAvatarShape)) {
      return null;
    }
    const knownFace = AGENT_ROLE_AVATAR_FACES.includes(
      face as AgentRoleAvatarFace,
    );
    return {
      kind,
      shape: shape as AgentRoleAvatarShape,
      face: knownFace ? (face as AgentRoleAvatarFace) : "dots",
      color,
    };
  }
  if (kind !== "emoji" || typeof emoji !== "string") {
    return null;
  }
  const firstGrapheme = new Intl.Segmenter()
    .segment(emoji.trim())
    [Symbol.iterator]()
    .next().value?.segment;
  if (!firstGrapheme || /^[\p{L}\p{N}\p{P}\s]/u.test(firstGrapheme)) {
    return null;
  }
  return { kind, emoji: firstGrapheme, color };
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
      sessionModeId: null,
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
    sameOptional(role.sessionModeId, draft.sessionModeId) &&
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

const DEFAULT_AVATAR_COLORS = AGENT_ROLE_AVATAR_COLORS.filter(
  (color) => color !== "gray",
);

function hashAvatarId(id: string) {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash;
}

export function defaultAgentRoleAvatarColor(id: string): AgentRoleAvatarColor {
  const hash = hashAvatarId(id);
  return DEFAULT_AVATAR_COLORS[hash % DEFAULT_AVATAR_COLORS.length];
}

export function defaultAgentRoleAvatarShape(id: string): AgentRoleAvatarShape {
  const hash = hashAvatarId(id);
  const index =
    Math.floor(hash / DEFAULT_AVATAR_COLORS.length) %
    AGENT_ROLE_AVATAR_SHAPES.length;
  return AGENT_ROLE_AVATAR_SHAPES[index];
}

export function defaultAgentRoleAvatarFace(id: string): AgentRoleAvatarFace {
  const hash = hashAvatarId(id);
  const index =
    Math.floor(
      hash / (DEFAULT_AVATAR_COLORS.length * AGENT_ROLE_AVATAR_SHAPES.length),
    ) % AGENT_ROLE_AVATAR_FACES.length;
  return AGENT_ROLE_AVATAR_FACES[index];
}

export function resolveAgentRoleAvatar(role: {
  id: string;
  avatar: AgentRoleAvatar | null;
}): AgentRoleAvatar {
  return (
    role.avatar ?? {
      kind: "shape",
      shape: defaultAgentRoleAvatarShape(role.id),
      face: defaultAgentRoleAvatarFace(role.id),
      color: defaultAgentRoleAvatarColor(role.id),
    }
  );
}

function firstGrapheme(text: string) {
  if (typeof Intl.Segmenter === "function") {
    return new Intl.Segmenter().segment(text)[Symbol.iterator]().next().value
      ?.segment;
  }
  return Array.from(text)[0];
}

export function agentRoleInitial(name: string) {
  return firstGrapheme(name.trim())?.toLocaleUpperCase() ?? "?";
}
