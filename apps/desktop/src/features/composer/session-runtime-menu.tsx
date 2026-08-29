import type {
  AgentId,
  AgentMcpServerRuntime,
  AgentPermissionMode,
  AgentProviderSnapshot,
  CompatibleProviderModel,
  ProviderModelRecord,
  ReasoningEffort,
} from "@cocurdex/shared";
import { supportsInSessionRuntimeAxis } from "@cocurdex/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  PermissionModeSubmenu,
  ProviderModelMenu,
  supportsLivePermissionMode,
} from "@/features/sessions";
import {
  getDefaultOpenCodeAgent,
  getOpenCodeRuntimeOptions,
  resolveOpenCodeRuntimeValue,
} from "@/features/sessions/provider-model/opencode-runtime-options";
import { shouldShowProviderGroupLabels } from "@/features/sessions/provider-model/provider-model-label";
import { composerFooterControlClassName } from "./chat-composer-layout";
import { McpRuntimeSubmenu } from "./mcp-runtime-submenu";

const DEFAULT_VALUE = "";

/**
 * The active-session picker deliberately uses ProviderModelMenu, the same
 * compound picker used by the new-session card. Only the session-owned
 * callbacks and footer rows differ.
 */
export function SessionRuntimeMenu({
  agentType,
  compatibleProviders,
  footer,
  label,
  model,
  modelValue,
  permissionMode,
  providerSnapshot,
  reasoningEffort,
  serviceTier,
  fastMode,
  mcpServers,
  thinkingLevel,
  triggerValues,
  onPermissionModeChange,
  onModelChange,
  onReasoningEffortChange,
  onServiceTierChange,
  onFastModeChange,
  onOpenCodeAgentChange,
  onOpenCodeVariantChange,
  onThinkingLevelReset,
}: {
  agentType: AgentId;
  compatibleProviders: CompatibleProviderModel[];
  /** Extra runtime rows owned by the composer (e.g. thinking level). */
  footer?: ReactNode;
  label: string;
  model: ProviderModelRecord | null;
  modelValue: string;
  permissionMode: AgentPermissionMode | null;
  providerSnapshot: AgentProviderSnapshot | null;
  reasoningEffort: ReasoningEffort | null;
  serviceTier: string | null;
  fastMode: boolean;
  mcpServers: readonly AgentMcpServerRuntime[] | null;
  /** Thinking level owned by the composer footer, cleared by "reset". */
  thinkingLevel?: string | null;
  /** Extra trigger chips (thinking / permission), matching new-session card. */
  triggerValues?: readonly string[];
  onPermissionModeChange(mode: AgentPermissionMode): void;
  onModelChange(value: string): void;
  onReasoningEffortChange(value: ReasoningEffort | null): void;
  onServiceTierChange(value: string | null): void;
  onFastModeChange(value: boolean): void;
  onOpenCodeAgentChange(value: string | null): void;
  onOpenCodeVariantChange(value: string | null): void;
  onThinkingLevelReset?(): void;
}) {
  const { t } = useTranslation("sessions");
  const hasModel = compatibleProviders.length > 1;
  const supportsRuntimeAxis = (
    axis: Parameters<typeof supportsInSessionRuntimeAxis>[1],
  ) => supportsInSessionRuntimeAxis(agentType, axis);
  // Codex alone uses the compound "reasoning effort" axis. Grok/Claude expose
  // the same model metadata through the ThinkingLevelSubmenu footer so the
  // new-session and active-session menus stay parallel.
  const effortOptions =
    agentType === "codex" && supportsRuntimeAxis("thinking")
      ? (model?.supportedReasoningEfforts ?? [])
      : [];
  // No "inherit" row on this axis: an unset session runs at the model's own
  // default effort, so that level is what the menu preselects.
  const defaultReasoningEffort = model?.defaultReasoningEffort ?? DEFAULT_VALUE;
  const tierOptions = supportsRuntimeAxis("speed")
    ? (model?.serviceTiers ?? [])
    : [];
  const fastModeOptions =
    supportsRuntimeAxis("speed") && model?.supportsFastMode
      ? [
          { label: t("modelMenu.fastModeOn"), value: "on" },
          { label: t("modelMenu.fastModeOff"), value: "off" },
        ]
      : [];
  const openCodeRuntimeOptions =
    agentType === "opencode"
      ? getOpenCodeRuntimeOptions(model, providerSnapshot)
      : { agents: [], variants: [] };
  const openCodeAgentOptions =
    agentType === "opencode" && supportsRuntimeAxis("agent")
      ? openCodeRuntimeOptions.agents.map((agent) => ({
          label: agent,
          value: agent,
        }))
      : [];
  const openCodeVariantOptions =
    agentType === "opencode" && supportsRuntimeAxis("variant")
      ? openCodeRuntimeOptions.variants.map((variant) => ({
          label: variant,
          value: variant,
        }))
      : [];
  const openCodeAgentValue = resolveOpenCodeRuntimeValue(
    providerSnapshot?.openCodeAgent,
    openCodeRuntimeOptions.agents,
  );
  const openCodeAgentMenuValue =
    openCodeAgentValue || getDefaultOpenCodeAgent(openCodeRuntimeOptions);
  const openCodeVariantValue = resolveOpenCodeRuntimeValue(
    providerSnapshot?.openCodeVariant,
    openCodeRuntimeOptions.variants,
  );
  const hasPermission = supportsLivePermissionMode(agentType);
  const hasRuntimeOptions =
    effortOptions.length > 0 ||
    tierOptions.length > 0 ||
    fastModeOptions.length > 1 ||
    openCodeAgentOptions.length > 1 ||
    openCodeVariantOptions.length > 1;
  const hasMenu =
    Boolean(footer) ||
    mcpServers !== null ||
    hasPermission ||
    hasModel ||
    hasRuntimeOptions;

  if (!hasMenu) {
    return <span className="min-w-0 truncate">{label}</span>;
  }

  const menuFooter = (
    <>
      {mcpServers !== null ? <McpRuntimeSubmenu servers={mcpServers} /> : null}
      {footer}
      {hasPermission ? (
        <PermissionModeSubmenu
          agentType={agentType}
          mode={permissionMode}
          providerSnapshot={providerSnapshot}
          onChange={onPermissionModeChange}
        />
      ) : null}
    </>
  );

  return (
    <ProviderModelMenu
      appearance="ghost"
      compatibleProviders={compatibleProviders}
      fastModeOptions={fastModeOptions}
      fastModeValue={fastMode ? "on" : "off"}
      footer={menuFooter}
      openCodeAgentDefaultValue={openCodeAgentMenuValue}
      openCodeAgentOptions={openCodeAgentOptions}
      openCodeAgentValue={openCodeAgentMenuValue}
      openCodeVariantOptions={openCodeVariantOptions}
      openCodeVariantValue={openCodeVariantValue}
      reasoningEffortOptions={effortOptions.map((effort) => ({
        description: effort.description,
        isDefault: effort.reasoningEffort === defaultReasoningEffort,
        label: effort.label ?? effort.reasoningEffort,
        value: effort.reasoningEffort,
      }))}
      reasoningEffortDefaultValue={defaultReasoningEffort}
      reasoningEffortValue={reasoningEffort ?? defaultReasoningEffort}
      serviceTierOptions={[
        { label: t("modelMenu.serviceTierStandard"), value: DEFAULT_VALUE },
        ...tierOptions.map((tier) => ({
          description: tier.description,
          label: tier.name,
          value: tier.id,
        })),
      ]}
      serviceTierValue={serviceTier ?? DEFAULT_VALUE}
      thinkingLevelValue={thinkingLevel ?? DEFAULT_VALUE}
      showProviderGroupLabels={shouldShowProviderGroupLabels(agentType)}
      triggerClassName={composerFooterControlClassName("min-w-0 max-w-[280px]")}
      triggerValues={triggerValues}
      value={modelValue}
      onChange={onModelChange}
      onFastModeChange={(value) => onFastModeChange(value === "on")}
      onOpenCodeAgentChange={(value) => onOpenCodeAgentChange(value || null)}
      onOpenCodeVariantChange={(value) =>
        onOpenCodeVariantChange(value || null)
      }
      onReasoningEffortChange={(value) =>
        onReasoningEffortChange(
          value === DEFAULT_VALUE ? null : (value as ReasoningEffort),
        )
      }
      onServiceTierChange={(value) =>
        onServiceTierChange(value === DEFAULT_VALUE ? null : value)
      }
      onThinkingLevelReset={onThinkingLevelReset}
    />
  );
}
