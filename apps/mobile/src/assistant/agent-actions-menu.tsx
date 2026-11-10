import type { SavedHost } from "@cocurdex/client-runtime";
import type { PersonalAgentRecord } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { hostConnection } from "@/connection";
import {
  type AnchoredMenuItem,
  type MenuAnchor,
  useAnchoredMenu,
  useConfirm,
} from "@/ui";
import { revalidateAssistant } from "./assistant-queries";

type AgentAction =
  | "edit"
  | "pin"
  | "unpin"
  | "mute"
  | "unmute"
  | "duplicate"
  | "delete";

const ACTION_ICONS: Record<
  AgentAction,
  NonNullable<AnchoredMenuItem["icon"]>
> = {
  edit: { ios: "pencil", android: "edit" },
  pin: { ios: "pin", android: "keep" },
  unpin: { ios: "pin.slash", android: "keep_off" },
  mute: { ios: "bell.slash", android: "notifications_off" },
  unmute: { ios: "bell", android: "notifications" },
  duplicate: { ios: "plus.square.on.square", android: "content_copy" },
  delete: { ios: "trash", android: "delete" },
};

export function useAgentActions(
  host: SavedHost,
  onOpenSession: (sessionId: string) => void,
) {
  const router = useRouter();
  const { t } = useTranslation("assistant");
  const menu = useAnchoredMenu("assistant-actions");
  const { confirm, dialog } = useConfirm();
  const connection = hostConnection(host.hostId);

  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      Alert.alert(t("actions.failed"));
    } finally {
      void revalidateAssistant(host.hostId);
    }
  };

  const labels: Record<AgentAction, string> = {
    edit: t("actions.edit"),
    pin: t("actions.pin"),
    unpin: t("actions.unpin"),
    mute: t("actions.mute"),
    unmute: t("actions.unmute"),
    duplicate: t("actions.duplicate"),
    delete: t("actions.delete"),
  };

  const handlers = (
    agent: PersonalAgentRecord,
  ): Record<AgentAction, () => void> => {
    const id = agent.id;
    const update = (patch: { pinned?: boolean; muted?: boolean }) =>
      void run(() =>
        connection.request("personalAgent.update", { id, ...patch }),
      );
    return {
      edit: () =>
        router.push({
          pathname: "/assistant-form/[hostId]",
          params: { hostId: host.hostId, agentId: id },
        }),
      pin: () => update({ pinned: true }),
      unpin: () => update({ pinned: false }),
      mute: () => update({ muted: true }),
      unmute: () => update({ muted: false }),
      duplicate: () =>
        void run(async () => {
          const copy = await connection.request("personalAgent.duplicate", {
            id,
            name: t("actions.copyName", { name: agent.role.name }),
          });
          onOpenSession(copy.homeSessionId);
        }),
      delete: () =>
        confirm({
          title: t("actions.deleteTitle", { name: agent.role.name }),
          message: t("actions.deleteMessage"),
          cancelLabel: t("actions.cancel"),
          confirmLabel: t("actions.delete"),
          destructive: true,
          onConfirm: () =>
            void run(() => connection.request("personalAgent.delete", { id })),
        }),
    };
  };

  const open = (agent: PersonalAgentRecord, anchor: MenuAnchor) => {
    if (!host.scopes.includes("interact")) return;
    const pin: AgentAction[] = agent.isDefault
      ? []
      : [agent.pinnedAt ? "unpin" : "pin"];
    const actions: AgentAction[] = [
      "edit",
      ...pin,
      agent.mutedAt ? "unmute" : "mute",
      "duplicate",
      "delete",
    ];
    const agentHandlers = handlers(agent);
    menu.open(anchor, {
      items: actions.map((action) => ({
        key: action,
        testID: `assistant-action-${action}`,
        label: labels[action],
        icon: ACTION_ICONS[action],
        group: action === "delete" ? "remove" : "organize",
        destructive: action === "delete",
        presents: action === "edit" || action === "delete",
        onPress: agentHandlers[action],
      })),
    });
  };

  return { open, menu: menu.menu, dialog };
}
