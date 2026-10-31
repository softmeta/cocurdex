import type { AgentRoleDraft } from "../agent-role";
import type {
  AgentId,
  AgentPermissionMode,
  SessionRecord,
  SessionRuntimeSelection,
} from "../contracts";
import { snapshotRuntimeSelection } from "./runtime-axes";

export interface RoleDraftSource {
  agentId: AgentId;
  model: { providerId: string; modelId: string; name: string | null } | null;
  permissionMode: AgentPermissionMode | null;
  sessionModeId?: string | null;
  runtime: SessionRuntimeSelection;
}

export function buildAgentRoleDraft(source: RoleDraftSource): AgentRoleDraft {
  const { runtime } = source;
  return {
    agentId: source.agentId,
    providerId: source.model?.providerId ?? null,
    modelId: source.model?.modelId ?? null,
    modelName: source.model?.name ?? null,
    permissionMode: source.permissionMode,
    sessionModeId: source.sessionModeId ?? null,
    reasoningEffort: runtime.reasoningEffort ?? null,
    serviceTier: runtime.serviceTier ?? null,
    fastMode: runtime.fastMode ?? null,
    thinkingLevel: runtime.thinkingLevel ?? null,
    openCodeAgent: runtime.openCodeAgent ?? null,
    openCodeVariant: runtime.openCodeVariant ?? null,
  };
}

export function roleDraftFromSession(
  session: Pick<
    SessionRecord,
    "agentType" | "providerSnapshot" | "permissionMode" | "sessionModeId"
  >,
): AgentRoleDraft {
  const snapshot = session.providerSnapshot ?? null;
  return buildAgentRoleDraft({
    agentId: session.agentType,
    model: snapshot
      ? {
          providerId: snapshot.providerId,
          modelId: snapshot.modelId,
          name: snapshot.modelName,
        }
      : null,
    permissionMode: session.permissionMode ?? null,
    sessionModeId: session.sessionModeId,
    runtime: snapshotRuntimeSelection(snapshot),
  });
}
