import type { SavedHost } from "@cocurdex/client-runtime";
import type { IssueFieldOption, IssueRecord } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { hostConnection } from "@/connection";
import { useScopeGate } from "@/hosts";
import { type MenuAnchor, useAnchoredMenu } from "@/ui";
import { useIssueView } from "./issue-queries";
import { withIssueStatus } from "./issue-sections";
import { IssueStatusMark } from "./issue-status-mark";

export function useIssueMove(host: SavedHost) {
  const { t } = useTranslation("issues");
  const gate = useScopeGate(host);
  const menu = useAnchoredMenu("issue-move");
  const view = useIssueView(host.hostId);

  const move = (issue: IssueRecord, statusId: string) => {
    const data = view.data;
    if (!data || statusId === issue.status) return;
    const update = hostConnection(host.hostId)
      .request("issue.update", {
        viewId: data.view.id,
        id: issue.id,
        status: statusId,
        expectedRevision: issue.revision,
      })
      .then(() => undefined);
    view
      .mutate(update, {
        optimisticData: withIssueStatus(data, issue.id, statusId),
        populateCache: false,
        revalidate: true,
        rollbackOnError: true,
      })
      .catch(() => Alert.alert(t("move.failed")));
  };

  const open = (
    issue: IssueRecord,
    statuses: readonly IssueFieldOption[],
    anchor: MenuAnchor,
  ) =>
    menu.open(anchor, {
      title: t("move.title"),
      items: statuses.map((status) => ({
        key: status.id,
        label: status.title,
        leading: (
          <IssueStatusMark category={status.category} label={status.title} />
        ),
        selected: status.id === issue.status,
        testID: `issue-move-${status.id}`,
        onPress: gate("interact", () => move(issue, status.id)),
      })),
    });

  return { open, menu: menu.menu };
}
