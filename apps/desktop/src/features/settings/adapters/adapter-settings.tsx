import {
  type AcpRegistryAgentUpdate,
  type AgentDescriptor,
  type AgentId,
  type AgentRateLimitsReadResult,
  isPlanUsageAgentId,
} from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { PackageSearch, RotateCw } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingsGroup } from "@/components/app";
import { Button, Spinner, Text } from "@/components/ui";
import {
  type AdapterStatusKind,
  AgentIcon,
  agentsAtom,
  bootstrapAgentsAtom,
  detectAgentsAtom,
  getAdapterStatus,
} from "@/features/sessions";
import { desktopApi, useMountEffect } from "@/lib";
import { AcpRegistryDialog } from "./acp-registry-dialog";
import { useAcpRegistryUpdates } from "./acp-registry-queries";
import { AdapterRateLimits } from "./adapter-rate-limits";
import { adapterRateLimitsCacheAtom } from "./adapter-rate-limits-cache";
import { splitAdaptersForSettings } from "./adapter-settings-order";
import {
  type AdapterDisplayStatus,
  AdapterStatusDot,
  useAdapterStatusLabel,
} from "./adapter-status-dot";
import { AgentDetailDialog } from "./agent-detail-dialog";
import {
  DisabledAdaptersGroup,
  MissingAdaptersGroup,
} from "./missing-adapters-group";

function rowStatus(
  kind: AdapterStatusKind,
  rateLimitsResult: AgentRateLimitsReadResult | undefined,
  update: AcpRegistryAgentUpdate | undefined,
): AdapterDisplayStatus | null {
  if (kind !== "ready" && kind !== "builtin") {
    return kind;
  }
  if (
    rateLimitsResult?.status === "error" &&
    rateLimitsResult.code === "authentication-required"
  ) {
    return "needs-login";
  }
  return update ? "update-available" : null;
}

function planUsageAgentIds(agents: AgentDescriptor[]) {
  return agents
    .filter((agent) => {
      if (!isPlanUsageAgentId(agent.id)) {
        return false;
      }
      const kind = getAdapterStatus(agent).kind;
      return kind === "ready" || kind === "outdated";
    })
    .map((agent) => agent.id);
}

function RowStatus({ status }: { status: AdapterDisplayStatus }) {
  const label = useAdapterStatusLabel(status);
  return (
    <Text
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
      size="meta"
      tone="muted"
    >
      {label}
      <AdapterStatusDot kind={status} />
    </Text>
  );
}

function AdapterRow({
  agent,
  onOpen,
  rateLimitsResult,
  update,
}: {
  agent: AgentDescriptor;
  onOpen(): void;
  rateLimitsResult: AgentRateLimitsReadResult | undefined;
  update: AcpRegistryAgentUpdate | undefined;
}) {
  const { t } = useTranslation("settings");
  const status = getAdapterStatus(agent);
  const displayStatus = rowStatus(status.kind, rateLimitsResult, update);

  return (
    <button
      aria-haspopup="dialog"
      className="-mx-2 flex h-13 w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 text-start outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
      data-agent-id={agent.id}
      onClick={onOpen}
      type="button"
    >
      <AgentIcon agentId={agent.id} className="size-4 shrink-0" />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <Text className="truncate font-medium" size="body">
          {agent.label}
        </Text>
        {status.kind === "builtin" ? (
          <Text className="shrink-0" size="meta" tone="muted">
            {t("adapters.badge.builtin")}
          </Text>
        ) : null}
        {status.version && status.kind !== "disabled" ? (
          <Text className="shrink-0 font-mono" size="meta" tone="muted">
            v{status.version}
          </Text>
        ) : null}
        {status.kind === "missing" && status.installHint ? (
          <Text className="min-w-0 truncate font-mono" size="meta" tone="muted">
            {status.installHint.command}
          </Text>
        ) : null}
      </span>
      {status.kind !== "disabled" &&
      rateLimitsResult?.status === "available" ? (
        <AdapterRateLimits
          layout="row"
          rateLimits={rateLimitsResult.rateLimits}
        />
      ) : null}
      {displayStatus ? <RowStatus status={displayStatus} /> : null}
    </button>
  );
}

export function AdapterSettingsPanel() {
  const { t } = useTranslation("settings");
  const agents = useAtomValue(agentsAtom);
  const bootstrapAgents = useSetAtom(bootstrapAgentsAtom);
  const detectAgents = useSetAtom(detectAgentsAtom);
  const [refreshing, setRefreshing] = useState(false);
  const [rateLimitsByAgent, setRateLimitsByAgent] = useAtom(
    adapterRateLimitsCacheAtom,
  );
  const [loadingAgentIds, setLoadingAgentIds] = useState<AgentId[]>(() =>
    planUsageAgentIds(agents).filter(
      (agentId) => rateLimitsByAgent[agentId] === undefined,
    ),
  );
  const rateLimitsByAgentRef = useRef(rateLimitsByAgent);
  rateLimitsByAgentRef.current = rateLimitsByAgent;
  const { installed, disabled, missing } = splitAdaptersForSettings(agents);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [openAgentId, setOpenAgentId] = useState<AgentId | null>(null);
  const openAgent = agents.find((agent) => agent.id === openAgentId) ?? null;
  const { data: updates, mutate: reloadUpdates } = useAcpRegistryUpdates();
  const updateFor = (agentId: AgentId | null) =>
    updates?.find((update) => update.agentId === agentId);

  const loadRateLimits = async (
    agentsToProbe: AgentDescriptor[],
    force: boolean,
  ) => {
    const ids = planUsageAgentIds(agentsToProbe).filter((agentId) => {
      return force || rateLimitsByAgentRef.current[agentId] === undefined;
    });
    if (ids.length === 0) {
      return;
    }
    const pendingIds = force
      ? ids.filter(
          (agentId) => rateLimitsByAgentRef.current[agentId] === undefined,
        )
      : ids;
    if (pendingIds.length > 0) {
      setLoadingAgentIds((current) => [
        ...new Set([...current, ...pendingIds]),
      ]);
    }
    try {
      const next = await desktopApi.readAdapterRateLimits(ids);
      setRateLimitsByAgent((current) => ({ ...current, ...next }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("adapters.rateLimits.unknownError");
      setRateLimitsByAgent((current) => ({
        ...current,
        ...Object.fromEntries(
          ids.map((agentId) => [
            agentId,
            { status: "error", code: "probe-failed", message },
          ]),
        ),
      }));
    } finally {
      setLoadingAgentIds((current) =>
        current.filter((agentId) => !ids.includes(agentId)),
      );
    }
  };

  const refresh = async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }
    try {
      if (!silent) {
        reloadUpdates(
          desktopApi.listAcpRegistryUpdates({ forceRefresh: true }),
          { revalidate: false },
        ).catch(() => undefined);
      }
      const nextAgents = await detectAgents();
      await loadRateLimits(nextAgents, !silent);
    } catch (error) {
      if (silent) {
        return;
      }
      toast.error(
        error instanceof Error
          ? error.message
          : t("adapters.toast.refreshFailed"),
      );
    } finally {
      if (!silent) {
        setRefreshing(false);
      }
    }
  };

  const toggleAgentEnabled = async (agentId: AgentId, enabled: boolean) => {
    try {
      const nextAgents = await desktopApi.setAgentEnabled(agentId, enabled);
      bootstrapAgents(nextAgents);
      if (!enabled) {
        setRateLimitsByAgent((current) => {
          const { [agentId]: _, ...rest } = current;
          return rest;
        });
        setLoadingAgentIds((current) =>
          current.filter((item) => item !== agentId),
        );
        return;
      }
      await Promise.all([
        loadRateLimits(nextAgents, true),
        reloadUpdates().catch(() => undefined),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("adapters.toast.refreshFailed"),
      );
    }
  };

  useMountEffect(() => {
    void loadRateLimits(agents, false);
    const onFocus = () => {
      void refresh(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  });

  const renderAdapterRow = (agent: AgentDescriptor) => (
    <AdapterRow
      agent={agent}
      key={agent.id}
      onOpen={() => setOpenAgentId(agent.id)}
      rateLimitsResult={rateLimitsByAgent[agent.id]}
      update={updateFor(agent.id)}
    />
  );

  return (
    <div className="settings-panel-enter flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Text size="meta" tone="muted">
          {t("adapters.description")}
        </Text>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            onClick={() => setRegistryOpen(true)}
            size="xs"
            type="button"
            variant="ghost"
          >
            <PackageSearch className="size-3.5" />
            {t("adapters.registry.open")}
          </Button>
          <AcpRegistryDialog
            open={registryOpen}
            onOpenChange={setRegistryOpen}
          />
          <Button
            disabled={refreshing}
            onClick={() => void refresh()}
            size="xs"
            type="button"
            variant="ghost"
          >
            {refreshing ? (
              <Spinner size="xs" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
            {t("adapters.action.refresh")}
          </Button>
        </div>
      </div>
      <SettingsGroup>{installed.map(renderAdapterRow)}</SettingsGroup>
      {disabled.length > 0 ? (
        <DisabledAdaptersGroup count={disabled.length}>
          {disabled.map(renderAdapterRow)}
        </DisabledAdaptersGroup>
      ) : null}
      {missing.length > 0 ? (
        <MissingAdaptersGroup count={missing.length}>
          {missing.map(renderAdapterRow)}
        </MissingAdaptersGroup>
      ) : null}
      <AgentDetailDialog
        agent={openAgent}
        onOpenChange={(open) => {
          if (!open) {
            setOpenAgentId(null);
          }
        }}
        onRemoved={() => refresh(true)}
        onToggleEnabled={toggleAgentEnabled}
        onUpdated={async () => {
          await Promise.all([refresh(true), reloadUpdates()]);
        }}
        rateLimitsLoading={
          openAgentId !== null && loadingAgentIds.includes(openAgentId)
        }
        rateLimitsResult={
          openAgentId === null ? undefined : rateLimitsByAgent[openAgentId]
        }
        showsRateLimits={
          openAgent !== null && planUsageAgentIds([openAgent]).length > 0
        }
        update={updateFor(openAgentId)}
      />
    </div>
  );
}
