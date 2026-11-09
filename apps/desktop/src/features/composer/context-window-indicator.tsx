import {
  type AgentContextBreakdownRecord,
  type AgentPermissionMode,
  type AgentRateLimitsRecord,
  type AgentThinkingLevel,
  getEffectiveThinkingLevel,
  isAcpRegistryAgentId,
  PLAN_MODE_ID,
  type ReasoningEffort,
  type SessionRecord,
  sessionConfiguration,
  supportsInSessionRuntimeAxis,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CircularProgress, Popover, PopoverTrigger } from "@/components/ui";
import { agentRuntimeBySessionAtom } from "@/features/agent/runtime";
import {
  agentsAtom,
  getAgentDisplayLabel,
  getProviderModelCacheVersion,
  getSessionModeOptions,
  getSessionPermissionMode,
  loadProviderModelOptions,
  providerConfigsAtom,
  providerModelCache,
  providerModelsAtom,
  sessionsAtom,
  subscribeProviderModelCache,
  updateAgentRuntimePreferences,
  updateSessionModeAtom,
  updateSessionPermissionModeAtom,
  updateSessionProviderRuntimeAtom,
  useSessionModeLabels,
} from "@/features/sessions";
import { usesAdapterOwnedModelCatalog } from "@/features/sessions/provider-model/adapter-owned-catalog";
import { probeProviderModelAxes } from "@/features/sessions/provider-model/provider-model-cache";
import {
  createProviderSnapshotForModel,
  getProviderModelSelectionValue,
  resolveRuntimeProviderModel,
} from "@/features/sessions/provider-model/provider-model-selection";
import { getRuntimeModelItems } from "@/features/sessions/provider-model/runtime-model-items";
import { workspacesAtom } from "@/features/workspaces";
import { desktopApi, taskApi, useMountEffect } from "@/lib";
import { resolveComposerSessionId } from "./composer-session-id";
import { formatTokenCount } from "./context-token-format";
import { ContextUsagePopoverContent } from "./context-usage-popover";
import { sessionContextBreakdownAtom } from "./session-context-breakdown-store";
import { sessionRateLimitsAtom } from "./session-rate-limits-store";
import { SessionRuntimeMenu } from "./session-runtime-menu";
import {
  getSessionContextTokens,
  sessionUsageAtom,
} from "./session-usage-store";

function formatModelLabel(modelName: string, providerName?: string | null) {
  const trimmedProviderName = providerName?.trim();
  return trimmedProviderName
    ? `${trimmedProviderName} / ${modelName}`
    : modelName;
}

function getContextRingToneClassName(percent: number | null) {
  if (percent == null) {
    return "text-chat-fg-secondary";
  }
  if (percent >= 90) {
    return "text-chat-status-failed-fg";
  }
  if (percent >= 70) {
    return "text-chat-status-running-fg";
  }
  return "text-chat-fg-secondary";
}

export function ContextUsageMeter({
  modelLabel,
  used,
  contextLimit,
  contextUnavailable,
  rateLimits,
  breakdown,
  layout = "inline",
  afterModel,
}: {
  modelLabel?: ReactNode;
  used: number | null;
  contextLimit: number | null;
  contextUnavailable?: boolean;
  rateLimits?: AgentRateLimitsRecord;
  breakdown?: AgentContextBreakdownRecord;
  layout?: "inline" | "split";
  afterModel?: ReactNode;
}) {
  const { t } = useTranslation("agent");
  const percent =
    used != null && contextLimit && contextLimit > 0
      ? Math.min(100, (used / contextLimit) * 100)
      : null;

  const usageLabel = (() => {
    if (used == null && !contextLimit) {
      return null;
    }
    const usedText = used != null ? formatTokenCount(used) : "—";
    const limitText = contextLimit ? formatTokenCount(contextLimit) : "—";
    return `${usedText} / ${limitText}`;
  })();
  const hasUsageContent = Boolean(
    rateLimits || (usageLabel && (percent != null || contextUnavailable)),
  );
  const usageContent = hasUsageContent ? (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={
            percent != null
              ? `${usageLabel} · ${t("contextWindow.tooltip", {
                  percent: percent.toFixed(1),
                })}`
              : t("contextWindow.label")
          }
          className="-my-1 inline-flex cursor-pointer items-center gap-1 rounded-full bg-transparent px-1.5 py-1 tabular-nums transition-colors hover:text-chat-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <CircularProgress
            indicatorClassName={getContextRingToneClassName(percent)}
            trackClassName="text-chat-border-strong"
            value={percent ?? 0}
          />
          {percent != null ? (
            <span>{Math.round(percent)}%</span>
          ) : contextUnavailable ? (
            <span>—</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <ContextUsagePopoverContent
        breakdown={breakdown}
        contextLimit={contextLimit}
        rateLimits={rateLimits}
        used={used}
      />
    </Popover>
  ) : null;
  const modelLabelContent =
    modelLabel != null ? (
      <span className="flex min-w-0">{modelLabel}</span>
    ) : null;

  if (layout === "split") {
    return (
      <>
        <div className="flex min-w-0 items-center gap-2">
          {modelLabelContent}
          {afterModel ? (
            <span className="flex min-w-0">{afterModel}</span>
          ) : null}
        </div>
        {hasUsageContent ? (
          <div
            aria-label={t("contextWindow.label")}
            className="ms-auto flex shrink-0 items-center gap-2 text-xs text-chat-fg-muted"
            role="status"
          >
            {usageContent}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      aria-label={t("contextWindow.label")}
      className="flex min-w-0 items-center gap-2 text-xs text-chat-fg-muted"
      role="status"
    >
      {modelLabelContent}
      {usageContent}
    </div>
  );
}

export function ContextWindowIndicator({
  header,
  footer,
  layout = "inline",
  afterModel,
  modelLeading,
  sessionId,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  isRunning?: boolean;
  layout?: "inline" | "split";
  afterModel?: ReactNode;
  modelLeading?: ReactNode;
  sessionId?: string | null;
}) {
  const { t } = useTranslation("sessions");
  const { label: sessionModeLabel } = useSessionModeLabels();
  const resolvedSessionId = resolveComposerSessionId(sessionId);
  const agents = useAtomValue(agentsAtom);
  const sessions = useAtomValue(sessionsAtom);
  const providerConfigs = useAtomValue(providerConfigsAtom);
  const agentRuntimeBySession = useAtomValue(agentRuntimeBySessionAtom);
  const providerModels = useAtomValue(providerModelsAtom);
  const sessionRateLimits = useAtomValue(sessionRateLimitsAtom);
  const sessionContextBreakdown = useAtomValue(sessionContextBreakdownAtom);
  const sessionUsage = useAtomValue(sessionUsageAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const updateSessionProviderRuntime = useSetAtom(
    updateSessionProviderRuntimeAtom,
  );
  const updateSessionPermissionMode = useSetAtom(
    updateSessionPermissionModeAtom,
  );
  const updateSessionMode = useSetAtom(updateSessionModeAtom);
  const providerModelCacheVersion = useSyncExternalStore(
    subscribeProviderModelCache,
    getProviderModelCacheVersion,
    getProviderModelCacheVersion,
  );

  const persistSession = (updatedSession: SessionRecord | null) => {
    const workspaceRootPath = workspaces.find(
      (workspace) => workspace.id === updatedSession?.workspaceId,
    )?.rootPaths[0];

    if (updatedSession && workspaceRootPath) {
      void taskApi.saveSessionConfiguration(
        sessionConfiguration(updatedSession),
      );
    }
  };

  const updateProviderRuntime = (payload: {
    sessionId: string;
    reasoningEffort?: ReasoningEffort | null;
    serviceTier?: string | null;
    fastMode?: boolean | null;
    openCodeAgent?: string | null;
    openCodeVariant?: string | null;
    thinkingLevel?: AgentThinkingLevel | null;
  }) => {
    const updatedSession = updateSessionProviderRuntime(payload);
    if (updatedSession) {
      updateAgentRuntimePreferences(updatedSession.agentType, {
        ...("reasoningEffort" in payload
          ? { reasoningEffort: payload.reasoningEffort ?? null }
          : {}),
        ...("serviceTier" in payload
          ? { serviceTier: payload.serviceTier ?? null }
          : {}),
        ...("fastMode" in payload
          ? { fastMode: payload.fastMode ?? null }
          : {}),
        ...("openCodeAgent" in payload
          ? { openCodeAgent: payload.openCodeAgent ?? null }
          : {}),
        ...("openCodeVariant" in payload
          ? { openCodeVariant: payload.openCodeVariant ?? null }
          : {}),
        ...("thinkingLevel" in payload
          ? { thinkingLevel: payload.thinkingLevel ?? null }
          : {}),
      });
    }
    persistSession(updatedSession);
  };

  const changeSessionMode = (sessionId: string, sessionModeId: string) => {
    persistSession(
      updateSessionMode({ sessionId, sessionModeId: sessionModeId || null }),
    );
  };

  const changePermissionMode = (
    sessionId: string,
    permissionMode: AgentPermissionMode,
  ) => {
    const updatedSession = updateSessionPermissionMode({
      sessionId,
      permissionMode,
    });
    const agentType = sessions.find((item) => item.id === sessionId)?.agentType;
    if (agentType) {
      updateAgentRuntimePreferences(agentType, {
        permissionMode,
      });
    }
    persistSession(updatedSession);
  };

  const session = resolvedSessionId
    ? sessions.find((s) => s.id === resolvedSessionId)
    : null;
  useMountEffect(() => {
    if (!session || !usesAdapterOwnedModelCatalog(session.agentType)) {
      return;
    }

    void loadProviderModelOptions(providerModelCache, session.agentType).catch(
      () => {},
    );
  });
  void providerModelCacheVersion;
  if (!session) {
    return null;
  }
  const snapshot = session.providerSnapshot;
  const runtimeModelItems = getRuntimeModelItems(
    session.agentType,
    providerModels,
    providerConfigs,
    snapshot ?? null,
  );
  const runtimeModelValue = snapshot
    ? `${snapshot.providerId}::${snapshot.modelId}`
    : "";

  const ownsModelCatalog =
    isAcpRegistryAgentId(session.agentType) ||
    session.agentType === "claude-agent" ||
    session.agentType === "codex";
  const usage = resolvedSessionId ? sessionUsage[resolvedSessionId] : undefined;
  const model = resolveRuntimeProviderModel(
    session.agentType,
    runtimeModelItems,
    providerModels,
    snapshot,
  );
  const changeProviderModel = (value: string) => {
    const selectedItem = runtimeModelItems.find(
      (item) => getProviderModelSelectionValue(item) === value,
    );
    if (!selectedItem) {
      return;
    }

    probeProviderModelAxes(
      providerModelCache,
      session.agentType,
      selectedItem.provider.id,
      selectedItem.model.modelId,
    );
    const updatedSession = updateSessionProviderRuntime({
      sessionId: session.id,
      providerSnapshot: createProviderSnapshotForModel(selectedItem),
    });
    if (updatedSession) {
      updateAgentRuntimePreferences(session.agentType, {
        providerSelection: {
          providerId: selectedItem.provider.id,
          modelId: selectedItem.model.modelId,
        },
      });
    }
    persistSession(updatedSession);
  };
  const supportsRuntimeAxis = (
    axis: Parameters<typeof supportsInSessionRuntimeAxis>[1],
  ) => supportsInSessionRuntimeAxis(session.agentType, axis);
  const explicitEffort = supportsRuntimeAxis("thinking")
    ? getEffectiveThinkingLevel(
        session.agentType,
        snapshot?.reasoningEffort,
        snapshot?.thinkingLevel,
      )
    : null;
  const reportedEffortLabel = snapshot?.supportedReasoningEfforts?.find(
    (option) => option.reasoningEffort === explicitEffort,
  )?.label;
  let effortLabel: string | null = null;
  if (explicitEffort && explicitEffort !== "default") {
    effortLabel =
      reportedEffortLabel ?? t(`composer.thinkingLevels.${explicitEffort}`);
  }
  const fastMode = supportsRuntimeAxis("speed")
    ? (snapshot?.fastMode ?? false)
    : false;
  const effectivePermissionMode = getSessionPermissionMode(agents, session);
  const permissionModeLabel = effectivePermissionMode
    ? t(`permissionMode.${effectivePermissionMode}`)
    : null;
  const sessionRuntime = agentRuntimeBySession[session.id];
  const runtimeMode = sessionRuntime?.mode;
  const sessionConfigOptions = sessionRuntime?.configOptions ?? [];
  const sessionModeChip = (() => {
    const runtimeModes = runtimeMode?.availableModes ?? [];
    const currentModeId =
      runtimeModes.length > 0
        ? runtimeMode?.currentModeId
        : session.sessionModeId;
    if (!currentModeId || currentModeId === "default") {
      return null;
    }

    const modes =
      runtimeModes.length > 0
        ? runtimeModes
        : getSessionModeOptions(agents, session.agentType);
    const mode = modes.find((option) => option.id === currentModeId);
    return mode ? sessionModeLabel(session.agentType, mode) : currentModeId;
  })();
  const menuTriggerValues: string[] = [];
  if (sessionModeChip) {
    menuTriggerValues.push(sessionModeChip);
  }
  if (session.agentType !== "codex" && effortLabel) {
    menuTriggerValues.push(effortLabel);
  }
  if (permissionModeLabel) {
    menuTriggerValues.push(permissionModeLabel);
  }
  const baseModelLabel = snapshot
    ? formatModelLabel(
        snapshot.modelName,
        ownsModelCatalog ? null : snapshot.providerName,
      )
    : getAgentDisplayLabel(session.agentType);
  const runtimeMenu = (
    <SessionRuntimeMenu
      agentType={session.agentType}
      compatibleProviders={runtimeModelItems}
      label={baseModelLabel}
      model={model}
      modelValue={runtimeModelValue}
      header={header}
      footer={footer}
      permissionMode={session.permissionMode ?? null}
      providerSnapshot={snapshot ?? null}
      reasoningEffort={snapshot?.reasoningEffort ?? null}
      serviceTier={snapshot?.serviceTier ?? null}
      fastMode={fastMode}
      mcpServers={sessionRuntime?.runtime?.mcpServers ?? null}
      configOptions={sessionConfigOptions}
      thinkingLevel={snapshot?.thinkingLevel ?? null}
      triggerLeading={modelLeading}
      triggerValues={menuTriggerValues}
      onPermissionModeChange={(permissionMode) =>
        changePermissionMode(session.id, permissionMode)
      }
      onModelChange={changeProviderModel}
      onReasoningEffortChange={(reasoningEffort) =>
        updateProviderRuntime({ sessionId: session.id, reasoningEffort })
      }
      onServiceTierChange={(serviceTier) =>
        updateProviderRuntime({ sessionId: session.id, serviceTier })
      }
      onFastModeChange={(fastMode) =>
        updateProviderRuntime({ sessionId: session.id, fastMode })
      }
      onOpenCodeAgentChange={(openCodeAgent) => {
        updateProviderRuntime({ sessionId: session.id, openCodeAgent });
        changeSessionMode(
          session.id,
          openCodeAgent === "plan" ? PLAN_MODE_ID : "default",
        );
      }}
      onOpenCodeVariantChange={(openCodeVariant) =>
        updateProviderRuntime({ sessionId: session.id, openCodeVariant })
      }
      onConfigOptionChange={(configId, value) => {
        void desktopApi.setSessionRuntimeConfig(session.id, configId, value);
      }}
    />
  );
  const modelLabel = runtimeMenu;
  const contextLimit =
    model?.contextLimit ??
    snapshot?.modelContextWindow ??
    usage?.contextWindowSize ??
    null;
  const used = usage ? getSessionContextTokens(usage) : null;

  return (
    <ContextUsageMeter
      afterModel={afterModel}
      breakdown={sessionContextBreakdown[session.id]}
      contextLimit={contextLimit}
      contextUnavailable={usage?.contextTokensUsed === null}
      layout={layout}
      modelLabel={modelLabel}
      rateLimits={sessionRateLimits[session.id]}
      used={used}
    />
  );
}
