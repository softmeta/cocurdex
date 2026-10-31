import {
  type AgentId,
  type AgentPermissionMode,
  isChatWorkspaceId,
  type SessionRecord,
  type SessionRuntimeSelection,
  type WorkspaceRecord,
} from "@cocurdex/shared";

export interface ModelChoice {
  providerId: string;
  modelId: string;
}

export interface NewSessionDraft {
  workspaceId: string | null;
  agentType?: AgentId;
  roleId?: string;
  model?: ModelChoice;
  permissionMode?: AgentPermissionMode;
  runtime?: SessionRuntimeSelection;
}

export interface WorkspaceChoice {
  workspace: WorkspaceRecord;
  sessionCount: number;
}

export const EMPTY_DRAFT: NewSessionDraft = { workspaceId: null };

export function chooseWorkspace(
  draft: NewSessionDraft,
  workspaceId: string,
): NewSessionDraft {
  return { ...draft, workspaceId };
}

export function chooseAgent(
  draft: NewSessionDraft,
  agentType: AgentId,
): NewSessionDraft {
  if (draft.agentType === agentType && !draft.roleId) return draft;
  return { workspaceId: draft.workspaceId, agentType };
}

export function chooseRole(
  draft: NewSessionDraft,
  role: { id: string; agentId: AgentId },
): NewSessionDraft {
  return {
    workspaceId: draft.workspaceId,
    agentType: role.agentId,
    roleId: role.id,
  };
}

export function chooseModel(
  draft: NewSessionDraft,
  agentType: AgentId,
  model: ModelChoice,
): NewSessionDraft {
  const { workspaceId, roleId, runtime } = draft;
  return {
    workspaceId,
    agentType,
    model,
    ...(roleId ? { roleId } : {}),
    ...(runtime ? { runtime } : {}),
  };
}

export function chooseRuntime(
  draft: NewSessionDraft,
  agentType: AgentId,
  patch: SessionRuntimeSelection,
): NewSessionDraft {
  return { ...draft, agentType, runtime: { ...draft.runtime, ...patch } };
}

export function displayedRuntime(
  draft: NewSessionDraft,
  agentType: AgentId | null,
  role: (SessionRuntimeSelection & { agentId: AgentId }) | undefined,
): SessionRuntimeSelection {
  const preset: SessionRuntimeSelection =
    role && role.agentId === agentType
      ? {
          reasoningEffort: role.reasoningEffort,
          serviceTier: role.serviceTier,
          fastMode: role.fastMode,
          thinkingLevel: role.thinkingLevel,
          openCodeAgent: role.openCodeAgent,
          openCodeVariant: role.openCodeVariant,
        }
      : {};
  return { ...preset, ...draft.runtime };
}

export function choosePermissionMode(
  draft: NewSessionDraft,
  agentType: AgentId,
  permissionMode: AgentPermissionMode,
): NewSessionDraft {
  return { ...draft, agentType, permissionMode };
}

function lastActivity(session: SessionRecord) {
  return session.lastMessageAt ?? session.updatedAt;
}

export function workspaceChoices(
  workspaces: readonly WorkspaceRecord[],
  sessions: readonly SessionRecord[],
): WorkspaceChoice[] {
  const activity = new Map<string, { count: number; latest: string }>();
  for (const session of sessions) {
    if (session.archivedAt || session.parentSessionId) continue;
    const entry = activity.get(session.workspaceId);
    const at = lastActivity(session);
    activity.set(session.workspaceId, {
      count: (entry?.count ?? 0) + 1,
      latest: entry && entry.latest > at ? entry.latest : at,
    });
  }
  return workspaces
    .filter((workspace) => !isChatWorkspaceId(workspace.id))
    .map((workspace, order) => ({
      workspace,
      order,
      latest: activity.get(workspace.id)?.latest ?? "",
      sessionCount: activity.get(workspace.id)?.count ?? 0,
    }))
    .sort(
      (left, right) =>
        right.latest.localeCompare(left.latest) || left.order - right.order,
    )
    .map(({ workspace, sessionCount }) => ({ workspace, sessionCount }));
}

export function draftWorkspaceId(
  draft: NewSessionDraft,
  choices: readonly WorkspaceChoice[],
) {
  const chosen = choices.find(
    (choice) => choice.workspace.id === draft.workspaceId,
  );
  return (chosen ?? choices[0])?.workspace.id ?? null;
}

export interface ResolvedChoices {
  agentType: AgentId;
  model?: ModelChoice | null;
  permissionMode?: AgentPermissionMode | null;
  permissionModes?: readonly AgentPermissionMode[];
}

export function displayedChoices(
  draft: NewSessionDraft,
  resolved: ResolvedChoices | undefined,
) {
  const agentType = draft.agentType ?? resolved?.agentType ?? null;
  const current = resolved && resolved.agentType === agentType;
  return {
    agentType,
    model: draft.model ?? (current ? (resolved.model ?? null) : null),
    permissionMode:
      draft.permissionMode ??
      (current ? (resolved.permissionMode ?? null) : null),
    permissionModes: current ? (resolved.permissionModes ?? []) : [],
  };
}
