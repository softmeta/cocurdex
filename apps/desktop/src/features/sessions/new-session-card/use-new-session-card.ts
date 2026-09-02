import {
  type AgentId,
  type AgentPermissionMode,
  type AgentProviderSnapshot,
  type AgentThinkingLevel,
  type CodexReasoningEffort,
  type CollaborationModeKind,
  type CompatibleProviderModel,
  isAgentPermissionModeSupportedForModel,
} from "@cocurdex/shared";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getThinkingLevelOptions,
  resolveThinkingLevel,
} from "@/features/composer";
import { desktopApi, logRendererDiagnostic } from "@/lib";
import { isAgentReadyToStart } from "../adapter-status";
import {
  getAgentRuntimePreferences,
  resolvePreferredPermissionMode,
  updateAgentRuntimePreferences,
} from "../agent-runtime-preferences";
import { supportsPlanMode } from "../collaboration-mode";
import {
  getCachedProviderModelEntry,
  getDefaultProviderModelValue,
  getProviderModelCacheVersion,
  isProviderModelCacheFresh,
  loadProviderModelOptions,
  parseProviderModelValue,
  providerModelCache,
  shouldRevalidateProviderModels,
  subscribeProviderModelCache,
  updateCachedProviderDefault,
} from "../provider-model";
import {
  getDefaultOpenCodeAgent,
  getOpenCodeRuntimeOptions,
  resolveOpenCodeRuntimeValue,
} from "../provider-model/opencode-runtime-options";
import {
  getDefaultPermissionMode,
  getPermissionModeOptions,
} from "../session-store";
import type { UseNewSessionCardProps } from "./new-session-card.types";
import {
  selectableAgentOptions as agentDropdownOptions,
  defaultAgentDescriptors,
} from "./new-session-card-config";
import { shouldPersistProviderDefault } from "./new-session-card-provider-default";

function permissionModeForAgent(
  agentId: AgentId,
  agents: UseNewSessionCardProps["agents"],
) {
  return resolvePreferredPermissionMode(
    agentId,
    getPermissionModeOptions(agents ?? [], agentId),
  );
}

// Owns agent/collaboration/permission/provider/workspace/branch state for
// the new-session card. The actual composer (editor, mentions, image
// attachments, paste/drag handling) is delegated to ChatComposer, so this
// hook intentionally stays out of editor concerns.
export function useNewSessionCard({
  workspaceName,
  agents = defaultAgentDescriptors,
  activeWorkspaceId,
  workspaces = [],
  agentType,
  collaborationMode = "default",
  workspaceRootPath,
  onSelectAgent,
  onSelectCollaborationMode,
}: UseNewSessionCardProps) {
  const { t } = useTranslation("sessions");
  const initialAgentType = agentType ?? "pi";
  const [initialRuntimePreferences] = useState(() =>
    getAgentRuntimePreferences(initialAgentType),
  );
  // Prefer the parent-owned last-selected agent (persisted to localStorage so
  // it survives remounts and restarts). Local state only backs uncontrolled
  // usage when `agentType` is omitted. Default is built-in cocurdex (`pi`).
  const [uncontrolledAgent, setUncontrolledAgent] = useState<AgentId>(
    () => agentType ?? "pi",
  );
  const selectedAgent = agentType ?? uncontrolledAgent;
  const [selectedCollaborationMode, setSelectedCollaborationMode] =
    useState<CollaborationModeKind>(collaborationMode);
  const [selectedPermissionMode, setSelectedPermissionMode] =
    useState<AgentPermissionMode | null>(() =>
      permissionModeForAgent(initialAgentType, agents),
    );
  const [compatibleProviders, setCompatibleProviders] = useState<
    CompatibleProviderModel[]
  >([]);
  const [isProviderModelLoading, setIsProviderModelLoading] = useState(false);
  const [selectedProviderModel, setSelectedProviderModel] = useState("");
  const [selectedCodexReasoningEffort, setSelectedCodexReasoningEffort] =
    useState(() => initialRuntimePreferences.reasoningEffort ?? "");
  const [selectedCodexServiceTier, setSelectedCodexServiceTier] = useState(
    () => initialRuntimePreferences.serviceTier ?? "",
  );
  const [selectedClaudeFastMode, setSelectedClaudeFastMode] = useState(
    () => initialRuntimePreferences.fastMode ?? false,
  );
  const [rawSelectedThinkingLevel, setSelectedThinkingLevel] =
    useState<AgentThinkingLevel>(
      () => initialRuntimePreferences.thinkingLevel ?? "default",
    );
  const [selectedOpenCodeAgent, setSelectedOpenCodeAgent] = useState(
    () => initialRuntimePreferences.openCodeAgent ?? "",
  );
  const [selectedOpenCodeVariant, setSelectedOpenCodeVariant] = useState(
    () => initialRuntimePreferences.openCodeVariant ?? "",
  );

  // Bumped whenever provider settings change, so the load effect below refetches
  // instead of keeping the pre-edit provider list.
  const providerModelCacheVersion = useSyncExternalStore(
    subscribeProviderModelCache,
    getProviderModelCacheVersion,
  );

  const hasWorkspace = Boolean(workspaceName);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const contextWorkspaceRootPath =
    workspaceRootPath ?? activeWorkspace?.rootPath ?? null;

  const selectedCompatibleProvider = compatibleProviders.find(
    ({ model, provider }) =>
      `${provider.id}::${model.modelId}` === selectedProviderModel,
  );
  const availableAgents = agents.filter(isAgentReadyToStart);
  const selectableAgentOptions = agentDropdownOptions.filter((agentOption) =>
    availableAgents.some((agent) => agent.id === agentOption.id),
  );
  const activeAgentAvailable = availableAgents.some(
    (agent) => agent.id === selectedAgent,
  );
  const effectiveSelectedAgent = activeAgentAvailable
    ? selectedAgent
    : (selectableAgentOptions[0]?.id ??
      availableAgents[0]?.id ??
      selectedAgent);
  const permissionModeOptions = getPermissionModeOptions(
    agents,
    effectiveSelectedAgent,
  );
  const permissionModeIsCurrent = Boolean(
    selectedPermissionMode &&
      permissionModeOptions.some(
        (option) => option.id === selectedPermissionMode,
      ),
  );
  const resolvedPermissionMode = permissionModeIsCurrent
    ? selectedPermissionMode
    : permissionModeForAgent(effectiveSelectedAgent, agents);
  const canStartWithSelectedAgent = availableAgents.some(
    (agent) => agent.id === effectiveSelectedAgent,
  );
  const requiresProviderModel = effectiveSelectedAgent === "pi";
  const canStartSession =
    canStartWithSelectedAgent &&
    (!requiresProviderModel || Boolean(selectedCompatibleProvider));
  const thinkingLevelOptions = getThinkingLevelOptions({
    agentType: effectiveSelectedAgent,
    supportsReasoning: selectedCompatibleProvider?.model.reasoning,
    thinkingLevelMapJson:
      selectedCompatibleProvider?.model.thinkingLevelMapJson,
    supportedReasoningEfforts:
      selectedCompatibleProvider?.model.supportedReasoningEfforts,
    defaultReasoningEffort:
      selectedCompatibleProvider?.model.defaultReasoningEffort ?? null,
  });
  const selectedThinkingLevel = resolveThinkingLevel(
    thinkingLevelOptions,
    rawSelectedThinkingLevel,
  );
  const openCodeRuntimeOptions =
    effectiveSelectedAgent === "opencode"
      ? getOpenCodeRuntimeOptions(selectedCompatibleProvider?.model)
      : { agents: [], variants: [] };
  const selectedOpenCodeAgentValue = resolveOpenCodeRuntimeValue(
    selectedOpenCodeAgent,
    openCodeRuntimeOptions.agents,
  );
  const selectedOpenCodeVariantValue = resolveOpenCodeRuntimeValue(
    selectedOpenCodeVariant,
    openCodeRuntimeOptions.variants,
  );
  const openCodeAgentDefaultValue = getDefaultOpenCodeAgent(
    openCodeRuntimeOptions,
  );
  const selectedOpenCodeAgentMenuValue =
    selectedOpenCodeAgentValue || openCodeAgentDefaultValue;
  const isClaudeAgent = effectiveSelectedAgent === "claude-agent";
  const claudeFastModeOptions =
    isClaudeAgent && selectedCompatibleProvider?.model.supportsFastMode
      ? [
          { label: t("modelMenu.fastModeOn"), value: "on" },
          { label: t("modelMenu.fastModeOff"), value: "off" },
        ]
      : [];

  const providerSnapshot: AgentProviderSnapshot | null =
    selectedCompatibleProvider
      ? {
          providerId: selectedCompatibleProvider.provider.id,
          providerName: selectedCompatibleProvider.provider.name,
          modelId: selectedCompatibleProvider.model.modelId,
          modelName: selectedCompatibleProvider.model.name,
          api: selectedCompatibleProvider.model.api,
          baseUrl: selectedCompatibleProvider.provider.baseUrl,
          modelBaseUrl: selectedCompatibleProvider.model.baseUrl ?? undefined,
          headersJson: selectedCompatibleProvider.provider.headersJson ?? null,
          // Pi-native provider/model metadata. Coalesced to undefined so the
          // snapshot stays minimal for runtimes that don't populate them.
          providerCompatJson:
            selectedCompatibleProvider.provider.compatJson ?? undefined,
          modelCapabilities: selectedCompatibleProvider.model.capabilities,
          supportsReasoning: selectedCompatibleProvider.model.reasoning,
          modelThinkingLevelMapJson:
            selectedCompatibleProvider.model.thinkingLevelMapJson ?? undefined,
          supportedReasoningEfforts:
            selectedCompatibleProvider.model.supportedReasoningEfforts,
          modelCostJson: selectedCompatibleProvider.model.costJson ?? undefined,
          modelCompatJson:
            selectedCompatibleProvider.model.compatJson ?? undefined,
          modelContextWindow:
            selectedCompatibleProvider.model.contextLimit ?? undefined,
          modelMaxTokens:
            selectedCompatibleProvider.model.outputLimit ?? undefined,
          thinkingLevel:
            rawSelectedThinkingLevel === "default"
              ? null
              : selectedThinkingLevel,
          ...(isClaudeAgent && selectedCompatibleProvider.model.supportsFastMode
            ? { fastMode: selectedClaudeFastMode }
            : {}),
          ...(effectiveSelectedAgent === "codex"
            ? {
                reasoningEffort: selectedCodexReasoningEffort
                  ? (selectedCodexReasoningEffort as CodexReasoningEffort)
                  : null,
                serviceTier: selectedCodexServiceTier || null,
              }
            : {}),
          ...(effectiveSelectedAgent === "opencode"
            ? {
                openCodeAgent: selectedOpenCodeAgentValue || null,
                openCodeVariant: selectedOpenCodeVariantValue || null,
              }
            : {}),
        }
      : null;

  const codexReasoningOptions =
    effectiveSelectedAgent === "codex" && selectedCompatibleProvider
      ? (selectedCompatibleProvider.model.supportedReasoningEfforts ?? []).map(
          (effort) => ({
            description: effort.description,
            label: effort.label ?? effort.reasoningEffort,
            value: effort.reasoningEffort,
          }),
        )
      : [];
  // No "inherit" row on this axis: an unset session runs at the model's own
  // default effort, so that level is what the menu preselects.
  const codexReasoningDefaultValue =
    selectedCompatibleProvider?.model.defaultReasoningEffort ?? "";

  const codexServiceTierOptions =
    effectiveSelectedAgent === "codex" && selectedCompatibleProvider
      ? [
          { label: t("modelMenu.serviceTierStandard"), value: "" },
          ...(selectedCompatibleProvider.model.serviceTiers ?? []).map(
            (tier) => ({
              description: tier.description,
              label: tier.name,
              value: tier.id,
            }),
          ),
        ]
      : [];

  useEffect(() => {
    let cancelled = false;
    // providerModelCacheVersion is consumed here so the effect re-runs when
    // provider settings are edited and the cache is invalidated.
    void providerModelCacheVersion;
    const cachedEntry = getCachedProviderModelEntry(
      providerModelCache,
      effectiveSelectedAgent,
    );
    const cachedResult = cachedEntry?.result ?? null;
    const shouldRefreshCache = shouldRevalidateProviderModels(
      effectiveSelectedAgent,
      isProviderModelCacheFresh(cachedEntry),
      cachedEntry?.runtimeValidated ?? false,
    );

    if (cachedResult) {
      setCompatibleProviders(cachedResult.items);
      setSelectedProviderModel(
        getDefaultProviderModelValue(
          effectiveSelectedAgent,
          cachedResult.items,
          cachedResult.defaultSelection,
          getAgentRuntimePreferences(effectiveSelectedAgent).providerSelection,
        ),
      );
      setIsProviderModelLoading(false);
      const preferences = getAgentRuntimePreferences(effectiveSelectedAgent);
      setSelectedCodexReasoningEffort(preferences.reasoningEffort ?? "");
      setSelectedCodexServiceTier(preferences.serviceTier ?? "");
      setSelectedClaudeFastMode(preferences.fastMode ?? false);
      setSelectedThinkingLevel(preferences.thinkingLevel ?? "default");
      setSelectedOpenCodeAgent(preferences.openCodeAgent ?? "");
      setSelectedOpenCodeVariant(preferences.openCodeVariant ?? "");
    } else {
      // Clear stale providers immediately so the dropdown doesn't show models
      // from the previously selected agent while the new ones are loading.
      setCompatibleProviders([]);
      setIsProviderModelLoading(true);
      setSelectedProviderModel("");
    }

    async function loadCompatibleProviders() {
      if (cachedResult && !shouldRefreshCache) {
        return;
      }

      const { defaultSelection, items } = await loadProviderModelOptions(
        providerModelCache,
        effectiveSelectedAgent,
      );

      if (cancelled) return;

      setCompatibleProviders(items);
      setSelectedProviderModel(
        getDefaultProviderModelValue(
          effectiveSelectedAgent,
          items,
          defaultSelection,
          getAgentRuntimePreferences(effectiveSelectedAgent).providerSelection,
        ),
      );
      setIsProviderModelLoading(false);
      const preferences = getAgentRuntimePreferences(effectiveSelectedAgent);
      setSelectedCodexReasoningEffort(preferences.reasoningEffort ?? "");
      setSelectedCodexServiceTier(preferences.serviceTier ?? "");
      setSelectedClaudeFastMode(preferences.fastMode ?? false);
      setSelectedThinkingLevel(preferences.thinkingLevel ?? "default");
      setSelectedOpenCodeAgent(preferences.openCodeAgent ?? "");
      setSelectedOpenCodeVariant(preferences.openCodeVariant ?? "");
    }

    void loadCompatibleProviders().catch((error) => {
      if (cancelled) return;

      logRendererDiagnostic(
        "debug",
        "[ProviderModel] load compatible providers failed",
        {
          agentId: effectiveSelectedAgent,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      );
      if (cachedResult) {
        return;
      }

      setCompatibleProviders([]);
      setIsProviderModelLoading(false);
      setSelectedProviderModel("");
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveSelectedAgent, providerModelCacheVersion]);

  if (selectedPermissionMode !== resolvedPermissionMode) {
    setSelectedPermissionMode(resolvedPermissionMode);
  }

  const handleSelectPermissionMode = (mode: AgentPermissionMode) => {
    setSelectedPermissionMode(mode);
    updateAgentRuntimePreferences(effectiveSelectedAgent, {
      permissionMode: mode,
    });
  };

  const handleSelectCodexReasoningEffort = (value: string) => {
    setSelectedCodexReasoningEffort(value);
    updateAgentRuntimePreferences(effectiveSelectedAgent, {
      reasoningEffort: value ? (value as CodexReasoningEffort) : null,
    });
  };

  const handleSelectCodexServiceTier = (value: string) => {
    setSelectedCodexServiceTier(value);
    updateAgentRuntimePreferences(effectiveSelectedAgent, {
      serviceTier: value || null,
    });
  };

  const handleSelectClaudeFastMode = (value: string) => {
    const fastMode = value === "on";
    setSelectedClaudeFastMode(fastMode);
    updateAgentRuntimePreferences(effectiveSelectedAgent, { fastMode });
  };

  const handleSelectThinkingLevel = (value: AgentThinkingLevel) => {
    setSelectedThinkingLevel(value);
    updateAgentRuntimePreferences(effectiveSelectedAgent, {
      thinkingLevel: value === "default" ? null : value,
    });
  };

  const handleSelectCollaborationMode = (nextMode: CollaborationModeKind) => {
    setSelectedCollaborationMode(nextMode);
    onSelectCollaborationMode?.(nextMode);
  };

  const handleSelectOpenCodeAgent = (value: string) => {
    setSelectedOpenCodeAgent(value);
    updateAgentRuntimePreferences(effectiveSelectedAgent, {
      openCodeAgent: value || null,
    });
    // OpenCode's agent list doubles as its collaboration axis, so picking
    // "plan" has to start the session in plan mode.
    handleSelectCollaborationMode(value === "plan" ? "plan" : "default");
  };

  const handleSelectOpenCodeVariant = (value: string) => {
    setSelectedOpenCodeVariant(value);
    updateAgentRuntimePreferences(effectiveSelectedAgent, {
      openCodeVariant: value || null,
    });
  };

  const handleSelectAgent = (nextAgent: AgentId) => {
    if (
      !supportsPlanMode(nextAgent) &&
      selectedCollaborationMode !== "default"
    ) {
      setSelectedCollaborationMode("default");
      onSelectCollaborationMode?.("default");
    }
    setUncontrolledAgent(nextAgent);
    setCompatibleProviders([]);
    setSelectedProviderModel("");
    setIsProviderModelLoading(true);
    const preferences = getAgentRuntimePreferences(nextAgent);
    setSelectedPermissionMode(permissionModeForAgent(nextAgent, agents));
    setSelectedCodexReasoningEffort(preferences.reasoningEffort ?? "");
    setSelectedCodexServiceTier(preferences.serviceTier ?? "");
    setSelectedClaudeFastMode(preferences.fastMode ?? false);
    setSelectedThinkingLevel(preferences.thinkingLevel ?? "default");
    setSelectedOpenCodeAgent(preferences.openCodeAgent ?? "");
    setSelectedOpenCodeVariant(preferences.openCodeVariant ?? "");
    // Parent (lastSelectedAgentAtom) persists to localStorage so the choice
    // is restored the next time this card opens, including after restart.
    onSelectAgent?.(nextAgent);
  };

  const handleSelectProviderModel = (nextProviderModel: string) => {
    const parsedProviderModel = parseProviderModelValue(nextProviderModel);
    const nextCompatibleProvider = compatibleProviders.find(
      ({ model, provider }) =>
        `${provider.id}::${model.modelId}` === nextProviderModel,
    );

    setSelectedProviderModel(nextProviderModel);
    handleSelectCodexReasoningEffort("");
    handleSelectCodexServiceTier("");

    if (!parsedProviderModel) {
      return;
    }

    if (
      resolvedPermissionMode &&
      !isAgentPermissionModeSupportedForModel(
        effectiveSelectedAgent,
        resolvedPermissionMode,
        nextCompatibleProvider?.model.modelId,
        nextCompatibleProvider?.model.name,
      )
    ) {
      handleSelectPermissionMode(
        getDefaultPermissionMode(agents, effectiveSelectedAgent),
      );
      toast.warning(
        t("permissionMode.changedForModel", {
          model:
            nextCompatibleProvider?.model.name ??
            nextCompatibleProvider?.model.modelId ??
            "Haiku",
        }),
      );
    }

    const { modelId, providerId } = parsedProviderModel;
    updateAgentRuntimePreferences(effectiveSelectedAgent, {
      providerSelection: { modelId, providerId },
    });
    updateCachedProviderDefault(
      providerModelCache,
      effectiveSelectedAgent,
      providerId,
      modelId,
    );

    if (!shouldPersistProviderDefault(effectiveSelectedAgent, providerId)) {
      return;
    }

    void desktopApi
      .setAgentProviderDefault(effectiveSelectedAgent, providerId, modelId)
      .catch((error: unknown) => {
        console.error("Failed to save agent provider default", error);
      });
  };

  return {
    selectedCollaborationMode,
    selectedPermissionMode: resolvedPermissionMode,
    permissionModeOptions,
    setSelectedPermissionMode: handleSelectPermissionMode,
    selectedCodexReasoningEffort,
    setSelectedCodexReasoningEffort: handleSelectCodexReasoningEffort,
    selectedCodexServiceTier,
    setSelectedCodexServiceTier: handleSelectCodexServiceTier,
    selectedClaudeFastMode,
    claudeFastModeOptions,
    setSelectedClaudeFastMode: handleSelectClaudeFastMode,
    selectedThinkingLevel,
    setSelectedThinkingLevel: handleSelectThinkingLevel,
    hasWorkspace,
    contextWorkspaceRootPath,
    compatibleProviders,
    isProviderModelLoading,
    selectedProviderModel,
    effectiveSelectedAgent,
    canStartSession,
    canStartWithSelectedAgent,
    codexReasoningOptions,
    codexReasoningDefaultValue,
    codexServiceTierOptions,
    thinkingLevelOptions,
    // Raw preference, not the resolved level: "reset" is only meaningful when
    // the user actually overrode the agent default.
    thinkingLevelOverride:
      rawSelectedThinkingLevel === "default" ? "" : rawSelectedThinkingLevel,
    openCodeAgentOptions:
      effectiveSelectedAgent === "opencode"
        ? [
            ...openCodeRuntimeOptions.agents.map((agent) => ({
              label: agent,
              value: agent,
            })),
          ]
        : [],
    openCodeAgentDefaultValue,
    openCodeAgentValue: selectedOpenCodeAgentMenuValue,
    openCodeVariantOptions:
      effectiveSelectedAgent === "opencode"
        ? openCodeRuntimeOptions.variants.map((variant) => ({
            label: variant,
            value: variant,
          }))
        : [],
    openCodeVariantValue: selectedOpenCodeVariantValue,
    setSelectedOpenCodeAgent: handleSelectOpenCodeAgent,
    setSelectedOpenCodeVariant: handleSelectOpenCodeVariant,
    selectableAgentOptions,
    providerSnapshot,
    handleSelectAgent,
    handleSelectCollaborationMode,
    handleSelectProviderModel,
  };
}
