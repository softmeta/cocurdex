import type {
  AgentRoleRecord,
  DelegatedWorkState,
  DelegatedWorkWaitingFor,
  DelegationCatalog,
  RunRecord,
  SessionRecord,
  TeamTemplateRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { isChatWorkspaceId, isPersonalWorkspaceId } from "@cocurdex/shared";

export type DelegationErrorCode =
  | "persona_not_found"
  | "workspace_not_found"
  | "workspace_ambiguous"
  | "role_not_found"
  | "template_not_found"
  | "role_and_template"
  | "work_not_found"
  | "empty_prompt"
  | "host_not_found"
  | "host_ambiguous"
  | "host_unreachable"
  | "remote_team";

export class DelegationError extends Error {
  override readonly name = "DelegationError";

  constructor(
    readonly code: DelegationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function matchesName(name: string, query: string) {
  return name.trim().toLowerCase() === query.trim().toLowerCase();
}

function findByIdOrName<T extends { id: string; name: string }>(
  items: readonly T[],
  query: string,
) {
  return (
    items.find((item) => item.id === query) ??
    items.find((item) => matchesName(item.name, query)) ??
    null
  );
}

export function isWorkWorkspace(workspace: WorkspaceRecord) {
  return (
    !isChatWorkspaceId(workspace.id) && !isPersonalWorkspaceId(workspace.id)
  );
}

export function branchSlug(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return slug || "task";
}

export function workTitle(prompt: string, title?: string | null) {
  return title?.trim() || prompt.split("\n")[0].slice(0, 80);
}

export function requirePrompt(prompt: string, message: string) {
  const trimmed = prompt.trim();
  if (!trimmed) throw new DelegationError("empty_prompt", message);
  return trimmed;
}

export function resolveWorkspace(
  all: readonly WorkspaceRecord[],
  query: string,
) {
  const workspaces = all.filter(isWorkWorkspace);
  const byId = workspaces.find((workspace) => workspace.id === query);
  if (byId) return byId;
  const byName = workspaces.filter((workspace) =>
    matchesName(workspace.name, query),
  );
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new DelegationError(
      "workspace_ambiguous",
      `Several workspaces are named "${query}"; pass its id.`,
    );
  }
  throw new DelegationError(
    "workspace_not_found",
    `No workspace matches "${query}". List the workspaces first.`,
  );
}

export function resolveRole(roles: readonly AgentRoleRecord[], query: string) {
  const role = findByIdOrName(roles, query);
  if (!role) {
    throw new DelegationError(
      "role_not_found",
      `No agent role matches "${query}".`,
    );
  }
  return role;
}

export function resolveTemplate(
  templates: readonly TeamTemplateRecord[],
  query: string,
) {
  const template = findByIdOrName(templates, query);
  if (!template) {
    throw new DelegationError(
      "template_not_found",
      `No team template matches "${query}".`,
    );
  }
  return template;
}

export function resolveHost<T extends { hostId: string; name: string }>(
  hosts: readonly T[],
  query: string,
) {
  const byId = hosts.find((host) => host.hostId === query);
  if (byId) return byId;
  const byName = hosts.filter((host) => matchesName(host.name, query));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new DelegationError(
      "host_ambiguous",
      `Several paired computers are named "${query}"; pass its id.`,
    );
  }
  throw new DelegationError(
    "host_not_found",
    `No paired computer matches "${query}". List them with work_catalog.`,
  );
}

export function buildCatalog(
  workspaces: readonly WorkspaceRecord[],
  roles: readonly AgentRoleRecord[],
  templates: readonly TeamTemplateRecord[],
): DelegationCatalog {
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  return {
    workspaces: workspaces.filter(isWorkWorkspace).map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      rootPaths: workspace.rootPaths,
    })),
    agentRoles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      agentType: role.agentId,
    })),
    teamTemplates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      members: template.members.map(
        (member) => roleNames.get(member.agentRoleId) ?? member.agentRoleId,
      ),
    })),
  };
}

export function workState(
  session: SessionRecord,
  activeRun: boolean,
  latestRun: RunRecord | null,
): DelegatedWorkState {
  if (session.archivedAt) return "archived";
  if (activeRun) return "running";
  return latestRun?.status ?? "idle";
}

interface PendingBySession {
  permissions: readonly { sessionId: string }[];
  questions: readonly { sessionId: string }[];
  planApprovals: readonly { sessionId: string }[];
}

export function pendingInteractionKind(
  pending: PendingBySession,
  sessionId: string,
): DelegatedWorkWaitingFor | null {
  const matches = (item: { sessionId: string }) => item.sessionId === sessionId;
  if (pending.permissions.some(matches)) return "permission";
  if (pending.questions.some(matches)) return "question";
  if (pending.planApprovals.some(matches)) return "plan";
  return null;
}
