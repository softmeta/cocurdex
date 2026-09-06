import type { AgentRoleRecord, AgentThinkingLevel } from "@cocurdex/shared";
import {
  getCachedProviderModelEntry,
  providerModelCache,
} from "../provider-model";

export function shortModelDisplayName(name: string) {
  const separator = " / ";
  const separatorIndex = name.indexOf(separator);
  if (separatorIndex === -1) {
    return name;
  }
  const itemLabel = name.slice(separatorIndex + separator.length).trim();
  return itemLabel || name;
}

function findCachedRoleModel(
  role: Pick<AgentRoleRecord, "agentId" | "providerId" | "modelId">,
) {
  const items =
    getCachedProviderModelEntry(providerModelCache, role.agentId)?.result
      ?.items ?? [];
  return (
    items.find(
      (item) =>
        item.provider.id === role.providerId &&
        item.model.modelId === role.modelId,
    ) ?? null
  );
}

export function resolveAgentRoleModelLabel(
  role: Pick<
    AgentRoleRecord,
    "agentId" | "providerId" | "modelId" | "modelName"
  >,
) {
  const cached = findCachedRoleModel(role);
  if (cached?.model.name) {
    return shortModelDisplayName(cached.model.name);
  }
  if (role.modelName) {
    return shortModelDisplayName(role.modelName);
  }
  return role.modelId;
}

export function resolveAgentRoleThinkingLevel(
  role: Pick<
    AgentRoleRecord,
    "agentId" | "providerId" | "modelId" | "thinkingLevel" | "reasoningEffort"
  >,
): AgentThinkingLevel | null {
  if (role.thinkingLevel && role.thinkingLevel !== "default") {
    return role.thinkingLevel;
  }
  if (role.reasoningEffort) {
    return role.reasoningEffort;
  }
  return findCachedRoleModel(role)?.model.defaultReasoningEffort ?? null;
}

export function resolveAgentRoleSpeedLabel(
  role: Pick<
    AgentRoleRecord,
    "agentId" | "providerId" | "modelId" | "fastMode" | "serviceTier"
  >,
  fastModeOnLabel: string,
) {
  if (role.fastMode) {
    return fastModeOnLabel;
  }
  if (!role.serviceTier) {
    return null;
  }
  const tier = findCachedRoleModel(role)?.model.serviceTiers?.find(
    (option) => option.id === role.serviceTier,
  );
  return tier?.name ?? role.serviceTier;
}

export function formatAgentRoleSummary(parts: {
  agentLabel: string;
  modelLabel: string | null;
  thinkingLabel?: string | null;
  speedLabel?: string | null;
  permissionLabel: string | null;
}) {
  return [
    parts.agentLabel,
    parts.modelLabel,
    parts.thinkingLabel,
    parts.speedLabel,
    parts.permissionLabel,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function formatAgentRoleRecordSummary(
  role: AgentRoleRecord,
  labels: {
    agentLabel: string;
    permissionLabel: string | null;
    thinkingLabelFor(level: AgentThinkingLevel): string;
    fastModeOn: string;
  },
) {
  const thinkingLevel = resolveAgentRoleThinkingLevel(role);
  return formatAgentRoleSummary({
    agentLabel: labels.agentLabel,
    modelLabel: resolveAgentRoleModelLabel(role),
    thinkingLabel: thinkingLevel
      ? labels.thinkingLabelFor(thinkingLevel)
      : null,
    speedLabel: resolveAgentRoleSpeedLabel(role, labels.fastModeOn),
    permissionLabel: labels.permissionLabel,
  });
}
