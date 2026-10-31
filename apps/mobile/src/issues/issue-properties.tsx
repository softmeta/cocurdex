import type { SavedHost } from "@cocurdex/client-runtime";
import type { IssueRecord, ViewFull } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useHostSessions } from "@/sessions";
import { Decorative, FormRow, FormText, useOptionSheet } from "@/ui";
import type { IssuePatch } from "./issue-patch";
import { IssuePriorityMark } from "./issue-priority-mark";
import { IssueStatusMark } from "./issue-status-mark";
import { useIssueUpdate } from "./issue-update";

const NO_WORKSPACE = "none";

export function IssueProperties({
  host,
  issue,
  view,
}: {
  host: SavedHost;
  issue: IssueRecord;
  view: ViewFull | undefined;
}) {
  const { t } = useTranslation("issues");
  const router = useRouter();
  const openSheet = useOptionSheet();
  const update = useIssueUpdate(host, issue.id);
  const { workspaces } = useHostSessions(host.hostId);
  const interactive = host.scopes.includes("interact") && view !== undefined;
  const statuses = view?.statusOptions ?? [];
  const priorities = view?.priorityOptions ?? [];
  const status = statuses.find((entry) => entry.id === issue.status);
  const priority = priorities.find((entry) => entry.id === issue.priority);
  const workspace = workspaces.find((entry) => entry.id === issue.workspaceId);
  const labels = issue.labelIds.flatMap(
    (id) => view?.labels.find((label) => label.id === id)?.name ?? [],
  );

  const apply = (patch: IssuePatch) =>
    update(patch).catch(() => Alert.alert(t("update.failed")));

  const pickStatus = () =>
    openSheet({
      title: t("field.status"),
      items: statuses.map((option) => ({
        key: option.id,
        label: option.title,
        leading: (
          <IssueStatusMark category={option.category} label={option.title} />
        ),
        selected: option.id === issue.status,
        testID: `issue-status-${option.id}`,
        onPress: () => void apply({ status: option.id }),
      })),
    });

  const pickPriority = () =>
    openSheet({
      title: t("field.priority"),
      items: priorities.map((option) => ({
        key: option.id,
        label: option.title,
        leading: (
          <IssuePriorityMark priority={option.id} label={option.title} />
        ),
        selected: option.id === issue.priority,
        testID: `issue-priority-${option.id}`,
        onPress: () => void apply({ priority: option.id }),
      })),
    });

  const pickWorkspace = () =>
    openSheet({
      title: t("field.workspace"),
      items: [{ id: NO_WORKSPACE, name: t("field.none") }, ...workspaces].map(
        (entry) => {
          const workspaceId = entry.id === NO_WORKSPACE ? null : entry.id;
          return {
            key: entry.id,
            label: entry.name,
            selected: workspaceId === issue.workspaceId,
            testID: `issue-workspace-${entry.id}`,
            onPress: () => void apply({ workspaceId }),
          };
        },
      ),
    });

  const pickLabels = () =>
    router.push({
      pathname: "/issue-labels/[hostId]/[issueId]",
      params: { hostId: host.hostId, issueId: issue.id },
    });

  const handler = (open: () => void) => (interactive ? open : undefined);

  return (
    <>
      <FormRow
        testID="issue-field-status"
        onPress={handler(pickStatus)}
        leading={
          <Decorative>
            <IssueStatusMark
              category={issue.statusCategory}
              label={status?.title ?? issue.status}
            />
          </Decorative>
        }
        trailing={
          <FormText tone="muted">{status?.title ?? issue.status}</FormText>
        }
      >
        {t("field.status")}
      </FormRow>
      <FormRow
        testID="issue-field-priority"
        onPress={handler(pickPriority)}
        trailing={
          <FormText tone="muted">{priority?.title ?? issue.priority}</FormText>
        }
      >
        {t("field.priority")}
      </FormRow>
      <FormRow
        testID="issue-field-workspace"
        onPress={handler(pickWorkspace)}
        trailing={
          <FormText tone="muted">{workspace?.name ?? t("field.none")}</FormText>
        }
      >
        {t("field.workspace")}
      </FormRow>
      <FormRow
        testID="issue-field-labels"
        onPress={handler(pickLabels)}
        trailing={
          <FormText tone="muted">
            {labels.length > 0 ? labels.join(", ") : t("field.none")}
          </FormText>
        }
      >
        {t("field.labels")}
      </FormRow>
    </>
  );
}
