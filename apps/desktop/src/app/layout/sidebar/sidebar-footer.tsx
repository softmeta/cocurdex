import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppSidebarIconButton } from "@/components/app";
import { MemoryStatusButton } from "@/features/memory";
import {
  AppsEntryButton,
  NetworkProxyStatusButton,
  openSettings,
} from "@/features/settings";
import { hostHasScope } from "@/lib";

export function SidebarFooter({ isAssistant }: { isAssistant: boolean }) {
  const { t } = useTranslation("sessions");

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 pe-1.75 ps-3">
      {isAssistant ? <AppsEntryButton /> : null}
      <div className="min-w-0 flex-1" />
      {isAssistant ? <MemoryStatusButton /> : null}
      {hostHasScope("host.admin") ? <NetworkProxyStatusButton /> : null}
      <AppSidebarIconButton
        aria-label={t("sidebar.settings")}
        onClick={() => openSettings()}
        tooltipSide="top"
      >
        <Settings className="size-3.5" />
      </AppSidebarIconButton>
    </div>
  );
}
