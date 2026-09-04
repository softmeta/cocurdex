import {
  type AgentDescriptor,
  type AgentId,
  type AgentRateLimitsReadResult,
  isPlanUsageAgentId,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { Check, Copy, ExternalLink, RotateCw } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge, Button, Spinner, Text } from "@/components/ui";
import {
  type AdapterStatus,
  type AdapterStatusKind,
  agentsAtom,
  bootstrapAgentsAtom,
  getAdapterStatus,
} from "@/features/sessions";
import { cn, desktopApi, useMountEffect } from "@/lib";
import {
  AdapterRateLimits,
  AdapterRateLimitsLoading,
} from "./adapter-rate-limits";
import { sortAdaptersForSettings } from "./adapter-settings-order";

const statusDotClassName: Record<AdapterStatusKind, string> = {
  builtin: "bg-status-success",
  detecting: "bg-muted-foreground/40",
  ready: "bg-status-success",
  outdated: "bg-status-warning",
  missing: "bg-muted-foreground/40",
  error: "bg-destructive",
};

const kindLabelTone: Record<AdapterStatusKind, "muted" | "destructive"> = {
  builtin: "muted",
  detecting: "muted",
  ready: "muted",
  outdated: "muted",
  missing: "muted",
  error: "destructive",
};

function adapterKindLabel(kind: AdapterStatusKind, t: TFunction<"settings">) {
  if (kind === "builtin") {
    return t("adapters.kind.builtin");
  }
  if (kind === "detecting") {
    return t("adapters.kind.detecting");
  }
  if (kind === "error") {
    return t("adapters.kind.error");
  }
  if (kind === "missing") {
    return t("adapters.kind.missing");
  }
  if (kind === "outdated") {
    return t("adapters.kind.outdated");
  }
  return t("adapters.kind.ready");
}

function AdapterStatusLine({
  agent,
  status,
}: {
  agent: AgentDescriptor;
  status: AdapterStatus;
}) {
  const { t } = useTranslation("settings");

  if (status.kind === "builtin") {
    return <>{t("adapters.status.builtin")}</>;
  }
  if (status.kind === "detecting") {
    return <>{t("adapters.status.detecting")}</>;
  }
  if (status.kind === "error") {
    return <>{status.error ?? t("adapters.status.error")}</>;
  }
  if (status.kind === "missing") {
    return (
      <>
        {t("adapters.status.missing", {
          executable: agent.installation?.executableName ?? agent.id,
        })}
      </>
    );
  }
  if (status.kind === "outdated") {
    return (
      <>
        {t("adapters.status.outdated", {
          installed: status.version ?? "?",
          minimum: status.minimumVersion ?? "?",
        })}
      </>
    );
  }

  return <>{status.executablePath ?? t("adapters.status.ready")}</>;
}

function AdapterExecutablePath({ path }: { path: string }) {
  const { t } = useTranslation("settings");
  const [copied, setCopied] = useState(false);

  const copyPath = async () => {
    await navigator.clipboard.writeText(path);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      aria-label={t("adapters.action.copyPath")}
      className="mt-0.5 h-auto max-w-full min-w-0 justify-start px-1.5 font-normal"
      size="xs"
      type="button"
      variant="ghost"
      onClick={() => void copyPath()}
    >
      <Text
        className="min-w-0 font-mono"
        size="meta"
        title={path}
        tone="muted"
        truncate
      >
        {path}
      </Text>
      {copied ? (
        <Check className="size-3.5 text-status-success" />
      ) : (
        <Copy className="size-3.5 text-muted-foreground" />
      )}
    </Button>
  );
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

function AdapterRow({
  agent,
  rateLimitsLoading,
  rateLimitsResult,
}: {
  agent: AgentDescriptor;
  rateLimitsLoading: boolean;
  rateLimitsResult: AgentRateLimitsReadResult | undefined;
}) {
  const { t } = useTranslation("settings");
  const status = getAdapterStatus(agent);
  const needsAction = status.kind === "missing" || status.kind === "outdated";
  const installHint = status.installHint;
  const readyPath =
    status.kind === "ready" || status.kind === "outdated"
      ? status.executablePath
      : null;
  let rateLimitsContent = null;
  if (rateLimitsResult?.status === "available") {
    rateLimitsContent = (
      <AdapterRateLimits rateLimits={rateLimitsResult.rateLimits} />
    );
  } else if (rateLimitsLoading) {
    rateLimitsContent = (
      <AdapterRateLimitsLoading label={t("adapters.rateLimits.loading")} />
    );
  } else if (rateLimitsResult?.status === "error") {
    let message: string;
    if (rateLimitsResult.code === "authentication-required") {
      message = t("adapters.rateLimits.authenticationRequired");
    } else if (rateLimitsResult.code === "timed-out") {
      message = t("adapters.rateLimits.timedOut");
    } else {
      message = t("adapters.rateLimits.failed", {
        message: rateLimitsResult.message,
      });
    }
    const errorTone =
      rateLimitsResult.code === "authentication-required"
        ? "muted"
        : "destructive";
    rateLimitsContent = (
      <Text className="mt-1.5 block" size="meta" tone={errorTone}>
        {message}
      </Text>
    );
  }

  const copyInstallCommand = async () => {
    if (!installHint) {
      return;
    }
    await navigator.clipboard.writeText(installHint.command);
    toast.success(t("adapters.toast.commandCopied"));
  };

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-1 gap-2.5">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            statusDotClassName[status.kind],
          )}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Text className="font-medium" size="body">
              {agent.label}
            </Text>
            {status.version ? (
              <Text className="font-mono" size="meta" tone="muted">
                v{status.version}
              </Text>
            ) : null}
            {status.kind === "outdated" ? (
              <Badge variant="destructive">
                {t("adapters.badge.updateRequired")}
              </Badge>
            ) : null}
          </div>
          {readyPath ? (
            <AdapterExecutablePath path={readyPath} />
          ) : (
            <Text className="mt-0.5 block truncate" size="meta" tone="muted">
              <AdapterStatusLine agent={agent} status={status} />
            </Text>
          )}
          {status.kind === "outdated" ? (
            <Text className="mt-0.5 block" size="meta" tone="muted">
              {t("adapters.status.outdatedHint")}
            </Text>
          ) : null}
          {rateLimitsContent}
          {needsAction && installHint ? (
            <Text className="mt-1 block font-mono" size="meta" tone="muted">
              {installHint.command}
            </Text>
          ) : null}
        </div>
      </div>
      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        <Text size="meta" tone={kindLabelTone[status.kind]}>
          {adapterKindLabel(status.kind, t)}
        </Text>
        {needsAction && installHint ? (
          <>
            <Button
              onClick={() => void copyInstallCommand()}
              size="xs"
              type="button"
              variant="ghost"
            >
              <Copy className="size-3.5" />
              {t("adapters.action.copyCommand")}
            </Button>
            <Button
              onClick={() => void desktopApi.openExternal(installHint.docsUrl)}
              size="xs"
              type="button"
              variant="ghost"
            >
              <ExternalLink className="size-3.5" />
              {t("adapters.action.docs")}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AdapterSettingsPanel() {
  const { t } = useTranslation("settings");
  const agents = useAtomValue(agentsAtom);
  const bootstrapAgents = useSetAtom(bootstrapAgentsAtom);
  const [refreshing, setRefreshing] = useState(false);
  const [rateLimitsByAgent, setRateLimitsByAgent] = useState<
    Partial<Record<AgentId, AgentRateLimitsReadResult>>
  >({});
  const [loadingAgentIds, setLoadingAgentIds] = useState<AgentId[]>(() =>
    planUsageAgentIds(agents),
  );
  const rateLimitsByAgentRef = useRef(rateLimitsByAgent);
  rateLimitsByAgentRef.current = rateLimitsByAgent;
  const sortedAgents = sortAdaptersForSettings(agents);

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
      const nextAgents = await desktopApi.listAgents();
      bootstrapAgents(nextAgents);
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

  useMountEffect(() => {
    void loadRateLimits(agents, false);
    const onFocus = () => {
      void refresh(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  });

  return (
    <div className="settings-panel-enter flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Text size="meta" tone="muted">
          {t("adapters.description")}
        </Text>
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
      <div className="rounded-card border border-border/70 bg-card/45 px-4">
        <div className="flex flex-col divide-y divide-border/60">
          {sortedAgents.map((agent) => (
            <AdapterRow
              agent={agent}
              key={agent.id}
              rateLimitsLoading={loadingAgentIds.includes(agent.id)}
              rateLimitsResult={rateLimitsByAgent[agent.id]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
