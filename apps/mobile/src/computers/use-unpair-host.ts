import type { SavedHost } from "@cocurdex/client-runtime";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/ui";
import { unpairHost } from "./unpair";

export function useUnpairHost() {
  const { t } = useTranslation("hosts");
  const { confirm, dialog } = useConfirm();
  const unpair = (host: SavedHost, onRemoved?: () => void) =>
    confirm({
      title: t("remove.title", { host: host.name }),
      message: t("remove.message"),
      cancelLabel: t("remove.cancel"),
      confirmLabel: t("remove.confirm"),
      destructive: true,
      onConfirm: () => {
        onRemoved?.();
        void unpairHost(host.hostId);
      },
    });
  return { unpair, dialog };
}
