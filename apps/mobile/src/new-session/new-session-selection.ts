import type { SavedHost } from "@cocurdex/client-runtime";
import { buildAgentRoleDraft, getSessionRuntimeAxes } from "@cocurdex/shared";
import {
  useAgentRoles,
  useAgents,
  useCompatibleModels,
  usePermissionModeLabels,
} from "@/agents";
import { runtimeSummary, useRuntimeLabels } from "@/session-runtime";
import { useHostSessions } from "@/sessions";
import {
  displayedRuntime,
  draftWorkspaceId,
  workspaceChoices,
} from "./new-session-draft";
import { useNewSessionDefaults } from "./new-session-queries";
import { useNewSessionState } from "./new-session-store";

export function useNewSessionSelection(host: SavedHost) {
  const { draft } = useNewSessionState();
  const { workspaces, sessions } = useHostSessions(host.hostId);
  const choices = workspaceChoices(workspaces, sessions);
  const workspaceId = draftWorkspaceId(draft, choices);
  const workspace = choices.find(
    (choice) => choice.workspace.id === workspaceId,
  );
  const defaults = useNewSessionDefaults(host.hostId, workspaceId, draft).data;
  const agentType = defaults?.agentType ?? null;
  const agent = useAgents(host.hostId).data?.find(
    (entry) => entry.id === agentType,
  );
  const role = useAgentRoles(host.hostId).data?.find(
    (entry) => entry.id === draft.roleId,
  );
  const modeLabels = usePermissionModeLabels();
  const runtimeLabels = useRuntimeLabels();
  const selectedModel = useCompatibleModels(host.hostId, agentType).data?.find(
    ({ provider, model }) =>
      defaults?.model?.providerId === provider.id &&
      defaults.model.modelId === model.modelId,
  )?.model;
  const runtime = displayedRuntime(draft, agentType, role);
  const runtimeParts = agentType
    ? runtimeSummary(
        getSessionRuntimeAxes(agentType, selectedModel, runtime),
        runtimeLabels,
      )
    : [];
  const modeLabel = defaults?.permissionMode
    ? modeLabels[defaults.permissionMode].label
    : null;
  const configDetail = [defaults?.model?.name, ...runtimeParts, modeLabel];
  const roleDraft = defaults
    ? buildAgentRoleDraft({
        agentId: defaults.agentType,
        model: defaults.model ?? null,
        permissionMode: defaults.permissionMode ?? null,
        runtime,
      })
    : null;
  return {
    draft,
    workspaceId,
    workspace,
    defaults,
    agent,
    role,
    configSummary: [
      role?.name,
      defaults?.model?.name ?? agent?.label,
      ...runtimeParts,
    ]
      .filter(Boolean)
      .join(" · "),
    modeLabel,
    roleDraft,
    roleSummary: [agent?.label, ...configDetail].filter(Boolean).join(" · "),
  };
}
