import type { SavedHost } from "@cocurdex/client-runtime";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { hostAddress, selectHost } from "@/hosts";
import { type AnchoredMenuItem, type MenuAnchor, useAnchoredMenu } from "@/ui";
import { useUnpairHost } from "./use-unpair-host";

type ComputerAction = "switch" | "rename" | "details" | "remove";

const ACTION_ICONS: Record<
  ComputerAction,
  NonNullable<AnchoredMenuItem["icon"]>
> = {
  switch: { ios: "arrow.left.arrow.right", android: "swap_horiz" },
  rename: { ios: "pencil", android: "edit" },
  details: { ios: "info.circle", android: "info" },
  remove: { ios: "minus.circle", android: "link_off" },
};

function computerHandlers(
  router: ReturnType<typeof useRouter>,
  host: SavedHost,
  unpair: (host: SavedHost) => void,
): Record<ComputerAction, () => void> {
  return {
    switch: () => selectHost(host.hostId),
    rename: () =>
      router.push({
        pathname: "/rename-computer/[hostId]",
        params: { hostId: host.hostId },
      }),
    details: () =>
      router.push({
        pathname: "/computer/[hostId]",
        params: { hostId: host.hostId },
      }),
    remove: () => unpair(host),
  };
}

export function useComputerActions() {
  const router = useRouter();
  const { t } = useTranslation("hosts");
  const menu = useAnchoredMenu("computer-actions");
  const { unpair, dialog } = useUnpairHost();
  const labels: Record<ComputerAction, string> = {
    switch: t("actions.switch"),
    rename: t("actions.rename"),
    details: t("actions.details"),
    remove: t("actions.remove"),
  };
  const open = (host: SavedHost, current: boolean, anchor: MenuAnchor) => {
    const handlers = computerHandlers(router, host, unpair);
    const actions: ComputerAction[] = [
      ...(current ? [] : (["switch"] as const)),
      "rename",
      "details",
      "remove",
    ];
    menu.open(anchor, {
      title: `${host.name} · ${hostAddress(host)}`,
      items: actions.map((action) => ({
        key: action,
        testID: `computer-action-${action}`,
        label: labels[action],
        icon: ACTION_ICONS[action],
        group: action === "remove" ? "remove" : "manage",
        destructive: action === "remove",
        onPress: handlers[action],
      })),
    });
  };
  return { open, menu: menu.menu, dialog };
}
