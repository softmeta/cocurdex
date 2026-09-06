import type {
  AgentDescriptor,
  AgentId,
  AgentPermissionMode,
  AgentThinkingLevel,
  CollaborationModeKind,
  CompatibleProviderModel,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import {
  getThinkingLevelLabel,
  getThinkingLevelOptions,
  resolveThinkingLevel,
  ThinkingLevelSubmenu,
} from "@/features/composer";
import { AgentSelect, buildAgentSelectOptions } from "../agent-select";
import { CollaborationModeSubmenu } from "../collaboration-mode-control";
import { PermissionModeSubmenu } from "../permission-mode-submenu";
import {
  getDefaultOpenCodeAgent,
  getOpenCodeRuntimeOptions,
  getProviderModelValue,
  ProviderModelMenu,
  resolveOpenCodeRuntimeValue,
  shouldShowProviderGroupLabels,
} from "../provider-model";
import { getPermissionModeOptions } from "../session-store";

export function AgentRoleRuntimeFields({
  agentId,
  agents,
  collaborationMode,
  compatibleProviders,
  fastMode,
  isLoading,
  modelValue,
  openCodeAgent,
  openCodeVariant,
  permissionMode,
  reasoningEffort,
  serviceTier,
  thinkingLevel,
  onAgentChange,
  onCollaborationModeChange,
  onFastModeChange,
  onModelChange,
  onOpenCodeAgentChange,
  onOpenCodeVariantChange,
  onPermissionModeChange,
  onReasoningEffortChange,
  onServiceTierChange,
  onThinkingLevelChange,
}: {
  agentId: AgentId;
  agents: AgentDescriptor[];
  collaborationMode: CollaborationModeKind;
  compatibleProviders: CompatibleProviderModel[];
  fastMode: boolean;
  isLoading: boolean;
  modelValue: string;
  openCodeAgent: string;
  openCodeVariant: string;
  permissionMode: AgentPermissionMode | null;
  reasoningEffort: string;
  serviceTier: string;
  thinkingLevel: AgentThinkingLevel;
  onAgentChange(agentId: AgentId): void;
  onCollaborationModeChange(mode: CollaborationModeKind): void;
  onFastModeChange(value: boolean): void;
  onModelChange(value: string): void;
  onOpenCodeAgentChange(value: string): void;
  onOpenCodeVariantChange(value: string): void;
  onPermissionModeChange(mode: AgentPermissionMode): void;
  onReasoningEffortChange(value: string): void;
  onServiceTierChange(value: string): void;
  onThinkingLevelChange(level: AgentThinkingLevel): void;
}) {
  const { t } = useTranslation("sessions");
  const selectedProviderModel = compatibleProviders.find(
    ({ provider, model }) =>
      getProviderModelValue(provider.id, model.modelId) === modelValue,
  );
  const permissionModeOptions = getPermissionModeOptions(agents, agentId);
  const thinkingLevelOptions = getThinkingLevelOptions({
    agentType: agentId,
    supportsReasoning: selectedProviderModel?.model.reasoning,
    thinkingLevelMapJson: selectedProviderModel?.model.thinkingLevelMapJson,
    supportedReasoningEfforts:
      selectedProviderModel?.model.supportedReasoningEfforts,
    defaultReasoningEffort:
      selectedProviderModel?.model.defaultReasoningEffort ?? null,
  });
  const selectedThinkingLevel = resolveThinkingLevel(
    thinkingLevelOptions,
    thinkingLevel,
  );
  const isClaudeAgent = agentId === "claude-agent";
  const claudeFastModeOptions =
    isClaudeAgent && selectedProviderModel?.model.supportsFastMode
      ? [
          { label: t("modelMenu.fastModeOn"), value: "on" },
          { label: t("modelMenu.fastModeOff"), value: "off" },
        ]
      : [];
  const codexReasoningOptions =
    agentId === "codex" && selectedProviderModel
      ? (selectedProviderModel.model.supportedReasoningEfforts ?? []).map(
          (effort) => ({
            description: effort.description,
            label: effort.label ?? effort.reasoningEffort,
            value: effort.reasoningEffort,
          }),
        )
      : [];
  const codexReasoningDefaultValue =
    selectedProviderModel?.model.defaultReasoningEffort ?? "";
  const codexServiceTierOptions =
    agentId === "codex" && selectedProviderModel
      ? [
          { label: t("modelMenu.serviceTierStandard"), value: "" },
          ...(selectedProviderModel.model.serviceTiers ?? []).map((tier) => ({
            description: tier.description,
            label: tier.name,
            value: tier.id,
          })),
        ]
      : [];
  const openCodeRuntimeOptions =
    agentId === "opencode"
      ? getOpenCodeRuntimeOptions(selectedProviderModel?.model)
      : { agents: [], variants: [] };
  const openCodeAgentDefaultValue = getDefaultOpenCodeAgent(
    openCodeRuntimeOptions,
  );
  const openCodeAgentValue =
    resolveOpenCodeRuntimeValue(openCodeAgent, openCodeRuntimeOptions.agents) ||
    openCodeAgentDefaultValue;
  const openCodeVariantValue = resolveOpenCodeRuntimeValue(
    openCodeVariant,
    openCodeRuntimeOptions.variants,
  );
  const triggerValues = [
    ...(collaborationMode === "plan" ? [t("collaborationMode.plan")] : []),
    ...(thinkingLevelOptions.length > 1 && selectedThinkingLevel
      ? [
          getThinkingLevelLabel(thinkingLevelOptions, selectedThinkingLevel) ??
            t(`composer.thinkingLevels.${selectedThinkingLevel}`),
        ]
      : []),
    ...(permissionMode ? [t(`permissionMode.${permissionMode}`)] : []),
  ];
  const agentOptions = buildAgentSelectOptions(agents);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AgentSelect
        appearance="outline"
        options={agentOptions}
        triggerLabel={
          agentOptions.find((option) => option.value === agentId)?.label ??
          agentId
        }
        value={agentId}
        onValueChange={onAgentChange}
      />
      <ProviderModelMenu
        appearance="outline"
        compatibleProviders={compatibleProviders}
        fastModeOptions={claudeFastModeOptions}
        fastModeValue={fastMode ? "on" : "off"}
        footer={
          <>
            <CollaborationModeSubmenu
              agentType={agentId}
              mode={collaborationMode}
              onChange={onCollaborationModeChange}
            />
            <ThinkingLevelSubmenu
              level={selectedThinkingLevel}
              options={thinkingLevelOptions}
              onChange={onThinkingLevelChange}
            />
            <PermissionModeSubmenu
              agentType={agentId}
              mode={permissionMode}
              options={permissionModeOptions}
              onChange={onPermissionModeChange}
            />
          </>
        }
        isLoading={isLoading}
        openCodeAgentDefaultValue={openCodeAgentDefaultValue}
        openCodeAgentOptions={openCodeRuntimeOptions.agents.map((value) => ({
          label: value,
          value,
        }))}
        openCodeAgentValue={openCodeAgentValue}
        openCodeVariantOptions={openCodeRuntimeOptions.variants.map(
          (value) => ({
            label: value,
            value,
          }),
        )}
        openCodeVariantValue={openCodeVariantValue}
        reasoningEffortDefaultValue={codexReasoningDefaultValue}
        reasoningEffortOptions={codexReasoningOptions}
        reasoningEffortValue={reasoningEffort || codexReasoningDefaultValue}
        serviceTierOptions={codexServiceTierOptions}
        serviceTierValue={serviceTier}
        showProviderGroupLabels={shouldShowProviderGroupLabels(agentId)}
        thinkingLevelValue={thinkingLevel === "default" ? "" : thinkingLevel}
        triggerValues={triggerValues}
        value={modelValue}
        onChange={onModelChange}
        onFastModeChange={(value) => onFastModeChange(value === "on")}
        onOpenCodeAgentChange={onOpenCodeAgentChange}
        onOpenCodeVariantChange={onOpenCodeVariantChange}
        onReasoningEffortChange={onReasoningEffortChange}
        onServiceTierChange={onServiceTierChange}
      />
    </div>
  );
}
