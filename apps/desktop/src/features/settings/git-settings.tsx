import type {
  AgentId,
  CommitMessageModelSelection,
  ReasoningEffort,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Spinner } from "@/components/ui";
import {
  getThinkingLevelLabel,
  getThinkingLevelOptions,
  resolveThinkingLevel,
  ThinkingLevelSubmenu,
} from "@/features/composer";
import {
  AgentSelect,
  agentsAtom,
  buildAgentSelectOptions,
  getCachedProviderModelEntry,
  getDefaultOpenCodeAgent,
  getDefaultProviderModelValue,
  getOpenCodeRuntimeOptions,
  getProviderModelCacheVersion,
  loadProviderModelOptions,
  ProviderModelMenu,
  parseProviderModelValue,
  providerModelCache,
  resolveOpenCodeRuntimeValue,
  shouldShowProviderGroupLabels,
  subscribeProviderModelCache,
} from "@/features/sessions";
import { desktopApi, useMountEffect } from "@/lib";
import {
  type CommitRuntimeSelection,
  createCommitSelection,
} from "./git-commit-selection";
import { settingsSelectTriggerClassName } from "./settings-select";

export function GitSettingsPanel() {
  const { t } = useTranslation(["settings", "common", "sessions"]);
  const agents = useAtomValue(agentsAtom);
  const agentSelectOptions = buildAgentSelectOptions(agents);
  const [agentId, setAgentId] = useState<AgentId>("pi");
  const [modelValue, setModelValue] = useState("");
  const [selection, setSelection] =
    useState<CommitMessageModelSelection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  useSyncExternalStore(
    subscribeProviderModelCache,
    getProviderModelCacheVersion,
    () => 0,
  );
  const cacheEntry = getCachedProviderModelEntry(providerModelCache, agentId);
  const compatibleProviders = cacheEntry?.result?.items ?? [];
  const selectedProviderModel = compatibleProviders.find(
    ({ provider, model }) => `${provider.id}::${model.modelId}` === modelValue,
  );
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
    selection?.thinkingLevel ?? "default",
  );
  const isClaudeAgent = agentId === "claude-agent";
  const claudeFastModeOptions =
    isClaudeAgent && selectedProviderModel?.model.supportsFastMode
      ? [
          { label: t("sessions:modelMenu.fastModeOn"), value: "on" },
          { label: t("sessions:modelMenu.fastModeOff"), value: "off" },
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
  // No "inherit" row on this axis: an unset selection runs at the model's own
  // default effort, so that level is what the menu preselects.
  const codexReasoningDefaultValue =
    selectedProviderModel?.model.defaultReasoningEffort ?? "";
  const codexServiceTierOptions =
    agentId === "codex" && selectedProviderModel
      ? [
          { label: t("sessions:modelMenu.serviceTierStandard"), value: "" },
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
    resolveOpenCodeRuntimeValue(
      selection?.openCodeAgent,
      openCodeRuntimeOptions.agents,
    ) || openCodeAgentDefaultValue;
  const openCodeVariantValue = resolveOpenCodeRuntimeValue(
    selection?.openCodeVariant,
    openCodeRuntimeOptions.variants,
  );
  const triggerValues =
    thinkingLevelOptions.length > 1 && selectedThinkingLevel
      ? [
          getThinkingLevelLabel(thinkingLevelOptions, selectedThinkingLevel) ??
            t(`sessions:composer.thinkingLevels.${selectedThinkingLevel}`),
        ]
      : [];

  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextSelection = await desktopApi.getCommitMessageModel();
        const nextAgentId = nextSelection?.agentId ?? "pi";
        const result = await loadProviderModelOptions(
          providerModelCache,
          nextAgentId,
        );
        if (cancelled) return;
        setAgentId(nextAgentId);
        if (nextSelection) {
          setSelection(nextSelection);
          setModelValue(
            getDefaultProviderModelValue(
              nextAgentId,
              result.items,
              result.defaultSelection,
              nextSelection,
            ),
          );
        }
      } catch (error) {
        console.error("Failed to load commit message models:", error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const noneLabel = t("git.commitMessageModel.none");
  async function persistSelection(
    next: CommitMessageModelSelection | null,
  ): Promise<boolean> {
    setIsSaving(true);
    try {
      await desktopApi.setCommitMessageModel(next);
      return true;
    } catch (error) {
      console.error("Failed to save commit message model:", error);
      toast.error(t("git.commitMessageModel.saveFailed"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function selectAgent(nextAgentId: string) {
    const agent = nextAgentId as AgentId;
    const previousAgentId = agentId;
    const previousModelValue = modelValue;
    const previousSelection = selection;
    setAgentId(agent);
    setModelValue("");
    setSelection(null);
    setIsLoading(true);
    try {
      const result = await loadProviderModelOptions(providerModelCache, agent);
      const nextModelValue = getDefaultProviderModelValue(
        agent,
        result.items,
        result.defaultSelection,
      );
      const parsed = parseProviderModelValue(nextModelValue);
      const item = result.items.find(
        ({ provider, model }) =>
          provider.id === parsed?.providerId &&
          model.modelId === parsed.modelId,
      );
      const nextSelection = parsed
        ? createCommitSelection(agent, parsed.providerId, parsed.modelId, item)
        : null;
      if (!(await persistSelection(nextSelection))) {
        setAgentId(previousAgentId);
        setModelValue(previousModelValue);
        setSelection(previousSelection);
        return;
      }
      setModelValue(nextModelValue);
      setSelection(nextSelection);
    } catch (error) {
      setAgentId(previousAgentId);
      setModelValue(previousModelValue);
      setSelection(previousSelection);
      console.error("Failed to load commit message models:", error);
      toast.error(t("git.commitMessageModel.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  async function selectModel(value: string) {
    const parsed = parseProviderModelValue(value);
    const item = compatibleProviders.find(
      ({ provider, model }) =>
        provider.id === parsed?.providerId && model.modelId === parsed.modelId,
    );
    const next = parsed
      ? createCommitSelection(agentId, parsed.providerId, parsed.modelId, item)
      : null;
    if (await persistSelection(next)) {
      setModelValue(value);
      setSelection(next);
    }
  }

  async function selectRuntimeOption(patch: CommitRuntimeSelection) {
    if (!selection) return;
    const next = { ...selection, ...patch };
    if (await persistSelection(next)) {
      setSelection(next);
    }
  }

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <div className="flex flex-col">
        <div className="mb-2 px-1 text-meta font-medium text-muted-foreground/60">
          {t("git.commitMessageModel.group")}
        </div>
        <div className="rounded-card border border-border/40 bg-card/45 px-4">
          <div className="flex flex-col divide-y divide-border/30">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {t("git.commitMessageModel.agentLabel")}
                </div>
                <div className="mt-0.5 text-2xs text-muted-foreground">
                  {t("git.commitMessageModel.agentDescription")}
                </div>
              </div>
              <AgentSelect
                align="end"
                appearance="ghost"
                disabled={isLoading || isSaving}
                options={agentSelectOptions}
                showChevron={!isLoading}
                triggerAriaLabel={t("git.commitMessageModel.agentLabel")}
                triggerClassName={settingsSelectTriggerClassName}
                triggerLabel={
                  <>
                    <span className="min-w-0 truncate">
                      {agentSelectOptions.find(
                        (agent) => agent.value === agentId,
                      )?.label ?? agentId}
                    </span>
                    {isLoading ? <Spinner size="xs" /> : null}
                  </>
                }
                value={agentId}
                onValueChange={(next) => {
                  void selectAgent(next);
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {t("git.commitMessageModel.modelLabel")}
                </div>
                <div className="mt-0.5 text-2xs text-muted-foreground">
                  {t("git.commitMessageModel.modelDescription")}
                </div>
              </div>
              <ProviderModelMenu
                align="end"
                appearance="ghost"
                compatibleProviders={compatibleProviders}
                footer={
                  <ThinkingLevelSubmenu
                    level={selectedThinkingLevel}
                    options={thinkingLevelOptions}
                    onChange={(value) => {
                      void selectRuntimeOption({
                        thinkingLevel: value === "default" ? null : value,
                      });
                    }}
                  />
                }
                disabled={isLoading || isSaving}
                emptyOptionLabel={
                  agentId === "claude-agent" ? undefined : noneLabel
                }
                isLoading={isLoading}
                reasoningEffortOptions={codexReasoningOptions}
                reasoningEffortDefaultValue={codexReasoningDefaultValue}
                reasoningEffortValue={
                  selection?.reasoningEffort ?? codexReasoningDefaultValue
                }
                fastModeOptions={claudeFastModeOptions}
                fastModeValue={selection?.fastMode ? "on" : "off"}
                serviceTierOptions={codexServiceTierOptions}
                serviceTierValue={selection?.serviceTier ?? ""}
                openCodeAgentOptions={openCodeRuntimeOptions.agents.map(
                  (value) => ({ label: value, value }),
                )}
                openCodeAgentDefaultValue={openCodeAgentDefaultValue}
                openCodeAgentValue={openCodeAgentValue}
                openCodeVariantOptions={[
                  {
                    label: t("sessions:modelMenu.openCodeVariantDefault"),
                    value: "",
                  },
                  ...openCodeRuntimeOptions.variants.map((value) => ({
                    label: value,
                    value,
                  })),
                ]}
                openCodeVariantValue={openCodeVariantValue}
                showProviderGroupLabels={shouldShowProviderGroupLabels(agentId)}
                triggerClassName={settingsSelectTriggerClassName}
                triggerValues={triggerValues}
                value={modelValue}
                onChange={(next) => {
                  void selectModel(next);
                }}
                onReasoningEffortChange={(value) => {
                  void selectRuntimeOption({
                    reasoningEffort: value ? (value as ReasoningEffort) : null,
                  });
                }}
                onFastModeChange={(value) => {
                  void selectRuntimeOption({ fastMode: value === "on" });
                }}
                onOpenCodeAgentChange={(value) => {
                  void selectRuntimeOption({ openCodeAgent: value || null });
                }}
                onOpenCodeVariantChange={(value) => {
                  void selectRuntimeOption({ openCodeVariant: value || null });
                }}
                onResetRuntimeOptions={() => {
                  void selectRuntimeOption({
                    reasoningEffort: null,
                    serviceTier: null,
                    fastMode: false,
                    openCodeAgent: null,
                    openCodeVariant: null,
                  });
                }}
                onServiceTierChange={(value) => {
                  void selectRuntimeOption({ serviceTier: value || null });
                }}
              />
            </div>
          </div>
        </div>
        <p className="mt-2 px-1 text-2xs text-muted-foreground">
          {t("git.commitMessageModel.footnote")}
        </p>
      </div>
    </div>
  );
}
