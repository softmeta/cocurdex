import type { SavedHost } from "@cocurdex/client-runtime";
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
import { reloadArchivedSessions } from "./archived-sessions-queries";
import type { SessionRow } from "./session-sections";
import { sessionsStore } from "./sessions";

type SessionAction =
  | "pin"
  | "unpin"
  | "rename"
  | "markUnread"
  | "fork"
  | "archive"
  | "delete";

const ACTION_ICONS: Record<
  SessionAction,
  NonNullable<AnchoredMenuItem["icon"]>
> = {
  pin: { ios: "pin", android: "keep" },
  unpin: { ios: "pin.slash", android: "keep_off" },
  rename: { ios: "pencil", android: "edit" },
  markUnread: { ios: "message.badge", android: "mark_chat_unread" },
  fork: { ios: "arrow.triangle.branch", android: "call_split" },
  archive: { ios: "archivebox", android: "archive" },
  delete: { ios: "trash", android: "delete" },
};

const ACTION_GROUPS: Record<SessionAction, string> = {
  pin: "organize",
  unpin: "organize",
  rename: "organize",
  markUnread: "organize",
  fork: "organize",
  archive: "remove",
  delete: "remove",
};

export function useSessionActions(host: SavedHost) {
  const router = useRouter();
  const { t } = useTranslation("sessions");
  const menu = useAnchoredMenu("session-actions");
  const { confirm, dialog } = useConfirm();
  const canExecute = host.scopes.includes("execute");
  const canInteract = host.scopes.includes("interact");
  const connection = hostConnection(host.hostId);

  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      void sessionsStore(host.hostId).reload();
      void reloadArchivedSessions(host.hostId);
    } catch {
      Alert.alert(t("detail.actionFailed"));
    }
  };

  const labels: Record<SessionAction, string> = {
    pin: t("actions.pin"),
    unpin: t("actions.unpin"),
    rename: t("actions.rename"),
    markUnread: t("actions.markUnread"),
    fork: t("actions.fork"),
    archive: t("actions.archive"),
    delete: t("actions.delete"),
  };

  const handlers = (row: SessionRow): Record<SessionAction, () => void> => {
    const sessionId = row.id;
    return {
      pin: () =>
        void run(() =>
          connection.request("session.setPinned", { sessionId, pinned: true }),
        ),
      unpin: () =>
        void run(() =>
          connection.request("session.setPinned", {
            sessionId,
            pinned: false,
          }),
        ),
      rename: () =>
        router.push({
          pathname: "/rename-session/[hostId]/[sessionId]",
          params: { hostId: host.hostId, sessionId },
        }),
      markUnread: () =>
        void run(() =>
          connection.request("attention.update", {
            sessionId,
            action: "mark-unread",
            at: new Date().toISOString(),
          }),
        ),
      fork: () =>
        void run(async () => {
          const fork = await connection.request("session.fork", {
            sessionId,
            title: t("message.forkTitle", { title: row.title }),
          });
          router.push({
            pathname: "/session/[hostId]/[sessionId]",
            params: { hostId: host.hostId, sessionId: fork.id },
          });
        }),
      archive: () =>
        void run(() => connection.request("session.archive", { sessionId })),
      delete: () =>
        confirm({
          title: t("actions.deleteTitle", { title: row.title }),
          message: t("actions.deleteMessage"),
          cancelLabel: t("actions.cancel"),
          confirmLabel: t("actions.delete"),
          destructive: true,
          onConfirm: () =>
            void run(() => connection.request("session.delete", { sessionId })),
        }),
    };
  };

  const open = (row: SessionRow, anchor: MenuAnchor) => {
    const pinAction: SessionAction[] =
      canInteract && row.depth === 0 ? [row.pinned ? "unpin" : "pin"] : [];
    const actions: SessionAction[] = [
      ...pinAction,
      ...(canInteract ? (["rename", "markUnread"] as const) : []),
      ...(canExecute ? (["fork"] as const) : []),
      ...(canInteract ? (["archive", "delete"] as const) : []),
    ];
    const rowHandlers = handlers(row);
    menu.open(anchor, {
      title: row.title,
      items: actions.map((action) => ({
        key: action,
        testID: `session-action-${action}`,
        label: labels[action],
        icon: ACTION_ICONS[action],
        group: ACTION_GROUPS[action],
        destructive: action === "delete",
        onPress: rowHandlers[action],
      })),
    });
  };

  return { open, menu: menu.menu, dialog };
}
