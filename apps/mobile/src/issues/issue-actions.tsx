import type { SavedHost } from "@cocurdex/client-runtime";
import type { IssueRecord } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { hostConnection } from "@/connection";
import { useScopeGate } from "@/hosts";
import {
  type AnchoredMenuItem,
  type MenuAnchor,
  useAnchoredMenu,
  useConfirm,
} from "@/ui";
import { type IssuePatch, patchedIssue } from "./issue-patch";
import { IssuePriorityMark } from "./issue-priority-mark";
import { useIssueView } from "./issue-queries";
import { IssueStatusMark } from "./issue-status-mark";

type IssueAction = "status" | "priority" | "edit" | "delete";

const ACTION_ICONS: Record<
  IssueAction,
  NonNullable<AnchoredMenuItem["icon"]>
> = {
  status: { ios: "circle.dashed", android: "radio_button_partial" },
  priority: { ios: "chart.bar", android: "signal_cellular_alt" },
  edit: { ios: "pencil", android: "edit" },
  delete: { ios: "trash", android: "delete" },
};

export function useIssueActions(host: SavedHost) {
  const { t } = useTranslation("issues");
  const router = useRouter();
  const gate = useScopeGate(host);
  const menu = useAnchoredMenu("issue-actions");
  const { confirm, dialog } = useConfirm();
  const view = useIssueView(host.hostId);
  const connection = hostConnection(host.hostId);

  const update = (issue: IssueRecord, patch: IssuePatch) => {
    const data = view.data;
    if (!data) return;
    const request = connection
      .request("issue.update", {
        viewId: data.view.id,
        id: issue.id,
        ...patch,
        expectedRevision: issue.revision,
      })
      .then(() => undefined);
    view
      .mutate(request, {
        optimisticData: {
          ...data,
          issues: data.issues.map((entry) =>
            entry.id === issue.id
              ? patchedIssue(entry, patch, data.statusOptions)
              : entry,
          ),
        },
        populateCache: false,
        revalidate: true,
        rollbackOnError: true,
      })
      .catch(() => Alert.alert(t("actions.failed")));
  };

  const remove = (issue: IssueRecord) => {
    const data = view.data;
    if (!data) return;
    const request = connection
      .request("issue.delete", {
        id: issue.id,
        expectedRevision: issue.revision,
      })
      .then(() => undefined);
    view
      .mutate(request, {
        optimisticData: {
          ...data,
          issues: data.issues.filter((entry) => entry.id !== issue.id),
        },
        populateCache: false,
        revalidate: true,
        rollbackOnError: true,
      })
      .catch(() => Alert.alert(t("actions.failed")));
  };

  const openStatus = (issue: IssueRecord, anchor: MenuAnchor) =>
    menu.open(anchor, {
      title: t("field.status"),
      items: (view.data?.statusOptions ?? []).map((status) => ({
        key: status.id,
        label: status.title,
        leading: (
          <IssueStatusMark category={status.category} label={status.title} />
        ),
        selected: status.id === issue.status,
        testID: `issue-status-${status.id}`,
        onPress: () => {
          if (status.id !== issue.status) update(issue, { status: status.id });
        },
      })),
    });

  const openPriority = (issue: IssueRecord, anchor: MenuAnchor) =>
    menu.open(anchor, {
      title: t("field.priority"),
      items: (view.data?.priorityOptions ?? []).map((priority) => ({
        key: priority.id,
        label: priority.title,
        leading: (
          <IssuePriorityMark priority={priority.id} label={priority.title} />
        ),
        selected: priority.id === issue.priority,
        testID: `issue-priority-${priority.id}`,
        onPress: () => {
          if (priority.id !== issue.priority) {
            update(issue, { priority: priority.id });
          }
        },
      })),
    });

  const labels: Record<IssueAction, string> = {
    status: t("field.status"),
    priority: t("field.priority"),
    edit: t("edit.action"),
    delete: t("actions.delete"),
  };

  const handlers = (
    issue: IssueRecord,
    anchor: MenuAnchor,
  ): Record<IssueAction, () => void> => ({
    status: () => openStatus(issue, anchor),
    priority: () => openPriority(issue, anchor),
    edit: () =>
      router.push({
        pathname: "/edit-issue/[hostId]/[issueId]",
        params: { hostId: host.hostId, issueId: issue.id },
      }),
    delete: () =>
      confirm({
        title: t("actions.deleteTitle", { title: issue.title }),
        message: t("actions.deleteMessage"),
        cancelLabel: t("actions.cancel"),
        confirmLabel: t("actions.delete"),
        destructive: true,
        onConfirm: () => remove(issue),
      }),
  });

  const open = (issue: IssueRecord, anchor: MenuAnchor) => {
    const rowHandlers = handlers(issue, anchor);
    const actions: readonly IssueAction[] = [
      "status",
      "priority",
      "edit",
      "delete",
    ];
    menu.open(anchor, {
      items: actions.map((action) => ({
        key: action,
        testID: `issue-action-${action}`,
        label: labels[action],
        icon: ACTION_ICONS[action],
        group: action === "delete" ? "remove" : "change",
        destructive: action === "delete",
        presents: true,
        onPress: gate("interact", rowHandlers[action]),
      })),
    });
  };

  return { open, menu: menu.menu, dialog };
}
