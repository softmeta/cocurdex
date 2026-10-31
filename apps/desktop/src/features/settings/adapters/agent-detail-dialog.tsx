import {
  type AgentDescriptor,
  type AgentRateLimitsReadResult,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { Check, Copy, ExternalLink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  rateLimitsLoading,
  rateLimitsResult,
  showsRateLimits,
}: {
  agent: AgentDescriptor | null;
  onOpenChange(open: boolean): void;
  onRemoved(): Promise<void>;
  rateLimitsLoading: boolean;
  rateLimitsResult: AgentRateLimitsReadResult | undefined;
  showsRateLimits: boolean;
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
            rateLimitsLoading={rateLimitsLoading}
            rateLimitsResult={rateLimitsResult}
            showsRateLimits={showsRateLimits}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AgentDetailContent({
  agent,
  onRemoved,
  rateLimitsLoading,
  rateLimitsResult,
  showsRateLimits,
}: {
  agent: AgentDescriptor;
  onRemoved(): Promise<void>;
  rateLimitsLoading: boolean;
  rateLimitsResult: AgentRateLimitsReadResult | undefined;
  showsRateLimits: boolean;
}) {
  const { t } = useTranslation("settings");
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

  return (
    <>
      <DialogHeader className="pe-8">
        <div className="flex min-w-0 items-start gap-3">
          <AgentIcon agentId={agent.id} className="mt-0.5 size-5 shrink-0" />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <DialogTitle className="truncate">{agent.label}</DialogTitle>
              {status.version ? (
                <Text className="font-mono" size="meta" tone="muted">
                  v{status.version}
                </Text>
              ) : null}
            </div>
            <DialogDescription className="flex min-w-0 items-center gap-1.5">
              <AdapterStatusDot kind={status.kind} />
              <span className="shrink-0">{statusLabel}</span>
              {detail ? (
                <span className="min-w-0 truncate" title={detail}>
                  · {detail}
                </span>
              ) : null}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3.5">
        {executablePath ? (
          <DetailField label={t("adapters.detail.executable")}>
            <ExecutablePath path={executablePath} />
          </DetailField>
        ) : null}
        {showsRateLimits ? (
          <DetailField label={t("adapters.detail.usage")}>
            <RateLimitsField
              loading={rateLimitsLoading}
              result={rateLimitsResult}
            />
          </DetailField>
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
    </>
  );
}
