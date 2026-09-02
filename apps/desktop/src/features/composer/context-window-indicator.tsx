import type {
  AgentContextBreakdownRecord,
  AgentPermissionMode,
  AgentRateLimitsRecord,
  AgentThinkingLevel,
  CollaborationModeKind,
  ReasoningEffort,
  SessionRecord,
} from "@cocurdex/shared";
import { supportsInSessionRuntimeAxis } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useSyncExternalStore } from "react";

import { useTranslation } from "react-i18next";
import { CircularProgress, Popover, PopoverTrigger } from "@/components/ui";
import { agentRuntimeBySessionAtom } from "@/features/agent/runtime";
import {
  activeSessionIdAtom,
  agentLabels,
  agentsAtom,
  getProviderModelCacheVersion,
  getSessionPermissionMode,
  loadProviderModelOptions,
  providerConfigsAtom,
  providerModelCache,
  providerModelsAtom,
  sessionsAtom,
  subscribeProviderModelCache,
  updateAgentRuntimePreferences,
  updateSessionCollaborationModeAtom,
  updateSessionPermissionModeAtom,
  updateSessionProviderRuntimeAtom,
} from "@/features/sessions";
import { usesAdapterOwnedModelCatalog } from "@/features/sessions/provider-model/adapter-owned-catalog";
import {
  createProviderSnapshotForModel,
  getProviderModelSelectionValue,
  resolveRuntimeProviderModel,
} from "@/features/sessions/provider-model/provider-model-selection";
import { getRuntimeModelItems } from "@/features/sessions/provider-model/runtime-model-items";
import { workspacesAtom } from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import { formatTokenCount } from "./context-token-format";
import { ContextUsagePopoverContent } from "./context-usage-popover";
import { sessionContextBreakdownAtom } from "./session-context-breakdown-store";
import { sessionRateLimitsAtom } from "./session-rate-limits-store";
import { SessionRuntimeMenu } from "./session-runtime-menu";
import {
  getSessionContextTokens,
  sessionUsageAtom,
} from "./session-usage-store";
import { getEffectiveThinkingLevel } from "./thinking-level";

export function formatModelLabel(
  modelName: string,
  providerName?: string | null,
) {
  const trimmedProviderName = providerName?.trim();
  return trimmedProviderName
    ? `${trimmedProviderName} / ${modelName}`
    : modelName;
}

// The ring warns on context pressure only; plan quota stays neutral so it never
// turns the footer into a spend alarm.
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

// Presentational meter shared by agent mode (ContextWindowIndicator) and chat
// mode (ConversationContextMeter): an optional model label plus a context
// usage ring against contextLimit. `modelLabel` is omitted when the caller
// already renders the model separately (e.g. an interactive picker).
export function ContextUsageMeter({
  modelLabel,
  used,
  contextLimit,
  rateLimits,
  breakdown,
  layout = "inline",
  afterModel,
}: {
  modelLabel?: ReactNode;
  used: number | null;
  contextLimit: number | null;
  rateLimits?: AgentRateLimitsRecord;
  // Reported only by agents that can see how the window is spent (Claude
  // Agent); the panel drops the composition sections without it.
  breakdown?: AgentContextBreakdownRecord;
  layout?: "inline" | "split";
  // Left-cluster content immediately after the model label in split layout
  // (e.g. the active git branch). Must stay left of the context ring.
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
    rateLimits || (usageLabel && percent != null),
  );
  // The ring is the only footer affordance for context, quota and composition,
  // so it also renders when usage is unknown (value 0) as long as quota exists.
  // The ring opens the usage panel for every agent — window meter always, plan
  // quota and window composition when the agent reports them. The panel must
  // open from a real PopoverTrigger: opening it from a plain onClick would let
  // Base UI read the same press as `outside-press` and close it again.
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
          className="-m-1 inline-flex cursor-pointer rounded-full bg-transparent p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <CircularProgress
            indicatorClassName={getContextRingToneClassName(percent)}
            trackClassName="text-chat-border-soft"
            value={percent ?? 0}
          />
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
      <span className="min-w-0 truncate text-chat-fg-secondary">
        {modelLabel}
      </span>
    ) : null;

  if (layout === "split") {
    return (
      <>
        <div className="flex min-w-0 items-center gap-2">
          {modelLabelContent}
          {afterModel ? <span className="min-w-0">{afterModel}</span> : null}
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

// Shows the active session's model label, token usage, and context usage ring
// against the configured contextLimit. Renders nothing when there is no
// active session — agents that don't emit usage simply show the model name
// with "—" for tokens until the first `usage.updated` arrives.
export function ContextWindowIndicator({
  footer,
  isRunning = false,
  layout = "inline",
  afterModel,
}: {
  footer?: ReactNode;
  isRunning?: boolean;
  layout?: "inline" | "split";
  afterModel?: ReactNode;
}) {
  const { t } = useTranslation("sessions");
  const activeSessionId = useAtomValue(activeSessionIdAtom);
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
  const updateSessionCollaborationMode = useSetAtom(
    updateSessionCollaborationModeAtom,
  );
  const providerModelCacheVersion = useSyncExternalStore(
    subscribeProviderModelCache,
    getProviderModelCacheVersion,
    getProviderModelCacheVersion,
  );

  const persistSession = (updatedSession: SessionRecord | null) => {
    const workspaceRootPath = workspaces.find(
      (workspace) => workspace.id === updatedSession?.workspaceId,
    )?.rootPath;

    if (updatedSession && workspaceRootPath) {
      void desktopApi.createSession({
        session: updatedSession,
        workspaceRootPath,
      });
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

  const changeCollaborationMode = (
    sessionId: string,
    collaborationMode: CollaborationModeKind,
  ) => {
    persistSession(
      updateSessionCollaborationMode({ sessionId, collaborationMode }),
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

  const session = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)
    : null;
  useMountEffect(() => {
    if (!session || !usesAdapterOwnedModelCatalog(session.agentType)) {
      return;
    }

    void loadProviderModelOptions(providerModelCache, session.agentType).catch(
      () => {
        // Keep the snapshot/settings fallback when discovery is unavailable.
      },
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

  // Fall back to the agent label so the footer always reflects what is in
  // play — sessions created before the providerSnapshot field was wired (or
  // sessions using Claude Code's default CLI auth without an explicit
  // provider pick) have a null snapshot but are still meaningful to show.
  // Single-provider adapter catalogs hide the provider name; multi-provider
  // ones (OpenCode) keep it so "anthropic / opus" stays readable.
  const ownsModelCatalog =
    session.agentType === "claude-agent" ||
    session.agentType === "grok-build" ||
    session.agentType === "codex";
  const usage = activeSessionId ? sessionUsage[activeSessionId] : undefined;
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
  // Agents that name their own levels (Grok Build) win over our level names.
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
  const collaborationModeLabel = (() => {
    if (runtimeMode && runtimeMode.currentModeId !== "default") {
      return (
        runtimeMode.availableModes.find(
          (option) => option.id === runtimeMode.currentModeId,
        )?.name ?? runtimeMode.currentModeId
      );
    }

    return session.collaborationMode === "plan"
      ? t("collaborationMode.plan")
      : null;
  })();
  // Match new-session trigger chips: collaboration, thinking and permission.
  // ProviderModelCompoundMenu owns the other active axes, so the model label
  // below must remain model-only to avoid rendering any value twice.
  const menuTriggerValues: string[] = [];
  if (collaborationModeLabel) {
    menuTriggerValues.push(collaborationModeLabel);
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
    : agentLabels[session.agentType];
  const modelLabel = (
    <SessionRuntimeMenu
      agentType={session.agentType}
      compatibleProviders={runtimeModelItems}
      label={baseModelLabel}
      model={model}
      modelValue={runtimeModelValue}
      footer={footer}
      permissionMode={session.permissionMode ?? null}
      providerSnapshot={snapshot ?? null}
      reasoningEffort={snapshot?.reasoningEffort ?? null}
      serviceTier={snapshot?.serviceTier ?? null}
      fastMode={fastMode}
      mcpServers={sessionRuntime?.runtime?.mcpServers ?? null}
      configOptions={sessionConfigOptions}
      isRunning={isRunning}
      thinkingLevel={snapshot?.thinkingLevel ?? null}
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
        // OpenCode's agent list is its collaboration axis: picking "plan" must
        // put the session in plan mode, since the adapter keys off that.
        changeCollaborationMode(
          session.id,
          openCodeAgent === "plan" ? "plan" : "default",
        );
      }}
      onOpenCodeVariantChange={(openCodeVariant) =>
        updateProviderRuntime({ sessionId: session.id, openCodeVariant })
      }
      onThinkingLevelReset={() =>
        updateProviderRuntime({ sessionId: session.id, thinkingLevel: null })
      }
      onConfigOptionChange={(configId, value) => {
        void desktopApi.setSessionRuntimeConfig(session.id, configId, value);
      }}
    />
  );
  // Grok (and similar ACP agents) are not in the global provider-models table
  // — their catalog is probed per-agent. Prefer that table when present, then
  // the session snapshot's modelContextWindow, then any agent-reported size.
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
      layout={layout}
      modelLabel={modelLabel}
      rateLimits={sessionRateLimits[session.id]}
      used={used}
    />
  );
}
