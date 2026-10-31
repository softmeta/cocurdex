import type { AgentId, SessionRecord } from "@cocurdex/shared";
import {
  type AgentRoleAvatarSource,
  getAgentDisplayLabel,
} from "@/features/sessions";
import type { SessionProperty } from "@/features/sessions/session-list-view";

export interface SessionMetaItem {
  agentId?: AgentId;
  key: SessionProperty;
  label: string;
  role?: AgentRoleAvatarSource;
  showRoleAgent?: boolean;
}

interface SessionMetaRole {
  avatar: AgentRoleAvatarSource["avatar"];
  id: string;
  name: string;
}

interface SessionMetaSource {
  role?: SessionMetaRole;
  session: SessionRecord;
  workspaceName?: string;
}

function worktreeName(worktreePath: string) {
  return worktreePath.split(/[\\/]/).filter(Boolean).at(-1) ?? worktreePath;
}

function resolveMetaItem(
  property: SessionProperty,
  { role, session, workspaceName }: SessionMetaSource,
): SessionMetaItem | null {
  switch (property) {
    case "agent":
      return {
        agentId: session.agentType,
        key: property,
        label: getAgentDisplayLabel(session.agentType),
      };
    case "model": {
      const modelName = session.providerSnapshot?.modelName;
      return modelName ? { key: property, label: modelName } : null;
    }
    case "role":
      return role
        ? {
            key: property,
            label: role.name,
            role: { ...role, agentId: session.agentType },
          }
        : null;
    case "workspace":
      return workspaceName ? { key: property, label: workspaceName } : null;
    case "worktree":
      return session.worktreePath
        ? { key: property, label: worktreeName(session.worktreePath) }
        : null;
    default:
      return null;
  }
}

export function resolveSessionMetaItems(
  properties: readonly SessionProperty[],
  source: SessionMetaSource,
): SessionMetaItem[] {
  const items = properties
    .map((property) => resolveMetaItem(property, source))
    .filter((item): item is SessionMetaItem => item !== null);
  const roleItem = items.find((item) => item.role);
  if (!(roleItem && items.some((item) => item.agentId))) {
    return items;
  }
  return items
    .filter((item) => item !== roleItem)
    .map((item) =>
      item.agentId ? { ...roleItem, showRoleAgent: true } : item,
    );
}
