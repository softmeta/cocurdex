import type { DelegatedWorkRecord } from "@cocurdex/shared";
import { Briefcase, Laptop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { desktopApi } from "@/lib";
import { OverviewRow } from "./assistant-overview-sections";

function useWorkStatus(item: DelegatedWorkRecord, stateLabel: string) {
  const { t } = useTranslation("personal");
  const host = item.host;
  if (host && !host.reachable) {
    return t("overview.hostOffline", { host: host.name });
  }
  if (item.waitingFor && host) {
    return t("overview.waitingOnHost", { host: host.name });
  }
  if (item.waitingFor) return t("overview.waitingForYou");
  return stateLabel;
}

export function AssistantWorkRow({
  item,
  stateLabel,
  onOpenLocal,
}: {
  item: DelegatedWorkRecord;
  stateLabel: string;
  onOpenLocal(sessionId: string): void;
}) {
  const { t } = useTranslation("personal");
  const status = useWorkStatus(item, stateLabel);
  const host = item.host;
  const place = host
    ? `${host.name} · ${item.workspaceName}`
    : item.workspaceName;
  const open = () => {
    if (!host) {
      onOpenLocal(item.sessionId);
      return;
    }
    if (!desktopApi.capabilities.remoteHostWindows) {
      toast.error(t("overview.remoteWindowUnavailable", { host: host.name }));
      return;
    }
    void desktopApi
      .openRemoteHostWindow({ hostId: host.id, sessionId: item.sessionId })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error)),
      );
  };
  return (
    <OverviewRow
      sessionId={item.sessionId}
      title={item.title}
      detail={`${place} · ${status}`}
      icon={
        host ? (
          <Laptop className="size-3.5 shrink-0" />
        ) : (
          <Briefcase className="size-3.5 shrink-0" />
        )
      }
      onClick={open}
    />
  );
}
