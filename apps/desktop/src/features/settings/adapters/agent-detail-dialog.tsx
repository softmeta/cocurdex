import {
  type AcpRegistryAgentUpdate,
  type AgentDescriptor,
  type AgentId,
  type AgentRateLimitsReadResult,
  canDisableAgent,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { Check, Copy, ExternalLink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog } from "@/components/app";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Switch,
  Text,
} from "@/components/ui";
import {
  type AdapterStatus,
  AgentIcon,
  getAdapterStatus,
} from "@/features/sessions";
import { desktopApi } from "@/lib";
import { AcpRegistryRemoveButton } from "./acp-registry-dialog";
import {
  AdapterRateLimits,
  AdapterRateLimitsLoading,
} from "./adapter-rate-limits";
import { AdapterStatusDot, useAdapterStatusLabel } from "./adapter-status-dot";
import { AgentAuthSection } from "./agent-auth-section";
import { AgentUpdateField } from "./agent-update-field";

function ExecutablePath({ path }: { path: string }) {
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
      className="-ms-1.5 h-auto max-w-full min-w-0 justify-self-start px-1.5 py-0.5 font-normal"
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
        <Check className="size-3.5 shrink-0 text-status-success" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </Button>
  );
}

function statusDetail(
  agent: AgentDescriptor,
  status: AdapterStatus,
  t: TFunction<"settings">,
) {
  if (status.kind === "error") {
    return status.error ?? t("adapters.status.error");
  }
  if (status.kind === "missing") {
    return t("adapters.status.missing", {
      executable: agent.installation?.executableName ?? agent.id,
    });
  }
  if (status.kind === "outdated") {
    return t("adapters.status.outdated", {
      installed: status.version ?? "?",
      minimum: status.minimumVersion ?? "?",
    });
  }
  if (status.kind === "builtin") {
    return t("adapters.detail.builtinNote");
  }
  if (status.kind === "disabled") {
    return t("adapters.detail.disabledNote");
  }
  return null;
}

function DetailField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <>
      <Text className="flex h-7 items-center" size="meta" tone="muted">
        {label}
      </Text>
      <div className="flex min-h-7 min-w-0 flex-col items-start justify-center gap-2">
        {children}
      </div>
    </>
  );
}

function RateLimitsField({
  loading,
  result,
}: {
  loading: boolean;
  result: AgentRateLimitsReadResult | undefined;
}) {
  const { t } = useTranslation("settings");
  const content = rateLimitsContent(loading, result, t);
  if (!content) {
    return null;
  }
  return (
    <DetailField label={t("adapters.detail.usage")}>{content}</DetailField>
  );
}

function rateLimitsContent(
  loading: boolean,
  result: AgentRateLimitsReadResult | undefined,
  t: TFunction<"settings">,
) {
  if (result?.status === "available") {
    return <AdapterRateLimits layout="detail" rateLimits={result.rateLimits} />;
  }
  if (loading) {
    return (
      <AdapterRateLimitsLoading label={t("adapters.rateLimits.loading")} />
    );
  }
  if (result?.status !== "error") {
    return null;
  }
  if (result.code === "authentication-required") {
    return (
      <Text size="meta" tone="muted">
        {t("adapters.rateLimits.authenticationRequired")}
      </Text>
    );
  }
  return (
    <Text className="break-words" size="meta" tone="destructive">
      {result.code === "timed-out"
        ? t("adapters.rateLimits.timedOut")
        : t("adapters.rateLimits.failed", { message: result.message })}
    </Text>
  );
}

function InstallField({ status }: { status: AdapterStatus }) {
  const { t } = useTranslation("settings");
  const installHint = status.installHint;
  if (!installHint) {
    return null;
  }

  const copyInstallCommand = async () => {
    await navigator.clipboard.writeText(installHint.command);
    toast.success(t("adapters.toast.commandCopied"));
  };

  return (
    <DetailField
      label={
        status.kind === "outdated"
          ? t("adapters.detail.update")
          : t("adapters.detail.install")
      }
    >
      {status.kind === "outdated" ? (
        <Text size="meta" tone="muted">
          {t("adapters.status.outdatedHint")}
        </Text>
      ) : null}
      <Text
        className="w-full rounded-control bg-muted px-2.5 py-2 font-mono break-all select-text"
        size="meta"
        tone="muted"
      >
        {installHint.command}
      </Text>
      <div className="-ms-2 flex items-center gap-1">
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
      </div>
    </DetailField>
  );
}

export function AgentDetailDialog({
  agent,
  onOpenChange,
  onRemoved,
  onToggleEnabled,
  onUpdated,
  rateLimitsLoading,
  rateLimitsResult,
  showsRateLimits,
  update,
}: {
  agent: AgentDescriptor | null;
  onOpenChange(open: boolean): void;
  onRemoved(): Promise<void>;
  onToggleEnabled(agentId: AgentId, enabled: boolean): Promise<void>;
  onUpdated(): Promise<void>;
  rateLimitsLoading: boolean;
  rateLimitsResult: AgentRateLimitsReadResult | undefined;
  showsRateLimits: boolean;
  update: AcpRegistryAgentUpdate | undefined;
}) {
  return (
    <Dialog open={agent !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {agent ? (
          <AgentDetailContent
            agent={agent}
            onRemoved={async () => {
              onOpenChange(false);
              await onRemoved();
            }}
            onToggleEnabled={onToggleEnabled}
            onUpdated={onUpdated}
            rateLimitsLoading={rateLimitsLoading}
            rateLimitsResult={rateLimitsResult}
            showsRateLimits={showsRateLimits}
            update={update}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AgentDetailContent({
  agent,
  onRemoved,
  onToggleEnabled,
  onUpdated,
  rateLimitsLoading,
  rateLimitsResult,
  showsRateLimits,
  update,
}: {
  agent: AgentDescriptor;
  onRemoved(): Promise<void>;
  onToggleEnabled(agentId: AgentId, enabled: boolean): Promise<void>;
  onUpdated(): Promise<void>;
  rateLimitsLoading: boolean;
  rateLimitsResult: AgentRateLimitsReadResult | undefined;
  showsRateLimits: boolean;
  update: AcpRegistryAgentUpdate | undefined;
}) {
  const { t } = useTranslation("settings");
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const status = getAdapterStatus(agent);
  const statusLabel = useAdapterStatusLabel(status.kind);
  const detail = statusDetail(agent, status, t);
  const executablePath =
    status.kind === "ready" || status.kind === "outdated"
      ? status.executablePath
      : null;
  const needsInstall = status.kind === "missing" || status.kind === "outdated";
  const registryAgentId = isAcpRegistryAgentId(agent.id) ? agent.id : null;
  const canSignIn =
    registryAgentId !== null &&
    (status.kind === "ready" || status.kind === "outdated");
  const canToggleEnabled =
    canDisableAgent(agent.id) && status.kind !== "missing";

  const applyToggleEnabled = async (enabled: boolean) => {
    setTogglingEnabled(true);
    try {
      await onToggleEnabled(agent.id, enabled);
    } finally {
      setTogglingEnabled(false);
    }
  };

  const handleToggleEnabled = (enabled: boolean) => {
    if (!enabled) {
      setConfirmingDisable(true);
      return;
    }
    void applyToggleEnabled(true);
  };

  return (
    <>
      <DialogHeader className="pe-8">
        <DialogTitle className="flex min-w-0 items-center gap-2">
          <AgentIcon agentId={agent.id} className="size-4 shrink-0" />
          <span className="truncate">{agent.label}</span>
          {status.version && status.kind !== "disabled" ? (
            <Text className="shrink-0 font-mono" size="meta" tone="muted">
              v{status.version}
            </Text>
          ) : null}
        </DialogTitle>
        <DialogDescription className="flex min-w-0 items-center gap-1.5">
          <AdapterStatusDot kind={status.kind} />
          <span className="shrink-0">{statusLabel}</span>
          {detail ? (
            <span className="min-w-0 truncate" title={detail}>
              · {detail}
            </span>
          ) : null}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-6 gap-y-3">
        {canToggleEnabled ? (
          <DetailField label={t("adapters.detail.enabled")}>
            <Switch
              aria-label={t("adapters.detail.enabled")}
              checked={agent.enabled !== false}
              disabled={togglingEnabled}
              onCheckedChange={handleToggleEnabled}
            />
          </DetailField>
        ) : null}
        {executablePath ? (
          <DetailField label={t("adapters.detail.executable")}>
            <ExecutablePath path={executablePath} />
          </DetailField>
        ) : null}
        {showsRateLimits ? (
          <RateLimitsField
            loading={rateLimitsLoading}
            result={rateLimitsResult}
          />
        ) : null}
        {canSignIn && registryAgentId ? (
          <DetailField label={t("adapters.detail.signIn")}>
            <AgentAuthSection
              agentId={registryAgentId}
              agentLabel={agent.label}
            />
          </DetailField>
        ) : null}
        {needsInstall ? <InstallField status={status} /> : null}
        {update && !needsInstall && status.kind !== "disabled" ? (
          <DetailField label={t("adapters.detail.update")}>
            <AgentUpdateField
              agentLabel={agent.label}
              onUpdated={onUpdated}
              update={update}
            />
          </DetailField>
        ) : null}
        {registryAgentId ? (
          <DetailField label={t("adapters.detail.manage")}>
            <AcpRegistryRemoveButton
              agentId={registryAgentId}
              label={agent.label}
              onRemoved={onRemoved}
            />
          </DetailField>
        ) : null}
      </div>
      <AppConfirmDialog
        cancelLabel={t("adapters.detail.disableCancel")}
        confirmLabel={t("adapters.detail.disableConfirm")}
        description={t("adapters.detail.disableConfirmDescription", {
          name: agent.label,
        })}
        open={confirmingDisable}
        title={t("adapters.detail.disableConfirmTitle", {
          name: agent.label,
        })}
        variant="destructive"
        onConfirm={() => void applyToggleEnabled(false)}
        onOpenChange={setConfirmingDisable}
      />
    </>
  );
}
