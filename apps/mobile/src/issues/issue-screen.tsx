import type { SavedHost } from "@cocurdex/client-runtime";
import type {
  EntityLink,
  IssueRecord,
  IssueSummary,
  ViewFull,
} from "@cocurdex/shared";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Alert, StyleSheet, Text, View } from "react-native";
import { LinkedEntitiesSection } from "@/entity-links";
import { MarkdownText } from "@/markdown";
import { space, useGroupedColors, useThemeColors } from "@/theme";
import {
  Form,
  FormRow,
  FormSection,
  HeaderButtons,
  ListNotice,
  PendingIndicator,
  useTransitionSettled,
} from "@/ui";
import {
  type IssueField,
  NO_WORKSPACE,
  PropertyChip,
  useIssueFieldChips,
} from "./issue-field-chips";
import type { IssuePatch } from "./issue-patch";
import { useIssueDetail, useIssueView } from "./issue-queries";
import { IssueStatusMark } from "./issue-status-mark";
import { useIssueUpdate } from "./issue-update";

function isShownAsIssueStructure(link: EntityLink) {
  if (link.removable) return false;
  return link.relation === "child" || link.relation === "worked-on-by";
}

const DETAIL_FIELDS: readonly IssueField[] = [
  "status",
  "priority",
  "workspace",
];

function fieldPatch(field: IssueField, value: string): IssuePatch {
  if (field === "workspace") {
    return { workspaceId: value === NO_WORKSPACE ? null : value };
  }
  return { [field]: value };
}

function IssueFields({
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
  const colors = useThemeColors();
  const grouped = useGroupedColors();
  const update = useIssueUpdate(host, issue.id);
  const interactive = host.scopes.includes("interact") && view !== undefined;
  const fields = useIssueFieldChips({
    hostId: host.hostId,
    options: view,
    values: {
      workspace: issue.workspaceId ?? NO_WORKSPACE,
      status: issue.status,
      priority: issue.priority,
    },
    testIDPrefix: "issue-field",
    enabled: interactive,
    chipColor: grouped.cell,
    beforePick: async () => {},
    onChange: (field, value) =>
      void update(fieldPatch(field, value)).catch(() =>
        Alert.alert(t("update.failed")),
      ),
  });
  const labels = issue.labelIds.flatMap(
    (id) => view?.labels.find((label) => label.id === id)?.name ?? [],
  );
  const labelText = labels.length > 0 ? labels.join(", ") : t("field.none");
  return (
    <View style={styles.fields}>
      {DETAIL_FIELDS.map(fields.chip)}
      <PropertyChip
        testID="issue-field-labels"
        label={labels.length > 0 ? labelText : t("field.labels")}
        unset={labels.length === 0}
        disabled={!interactive}
        color={grouped.cell}
        accessibilityLabel={`${t("field.labels")}, ${labelText}`}
        leading={
          <SymbolView
            name={{ ios: "tag", android: "sell" }}
            size={16}
            tintColor={colors.mutedForeground}
          />
        }
        onPress={() =>
          router.push({
            pathname: "/issue-labels/[hostId]/[issueId]",
            params: { hostId: host.hostId, issueId: issue.id },
          })
        }
      />
      {fields.menu}
    </View>
  );
}

function SubIssueRow({
  issue,
  onPress,
}: {
  issue: IssueSummary;
  onPress(): void;
}) {
  return (
    <FormRow
      testID={`issue-child-${issue.id}`}
      onPress={onPress}
      leading={
        <IssueStatusMark category={issue.statusCategory} label={issue.status} />
      }
      supporting={issue.identifier}
    >
      {issue.title}
    </FormRow>
  );
}

export function IssueScreen({
  host,
  issueId,
}: {
  host: SavedHost;
  issueId: string;
}) {
  const { t } = useTranslation("issues");
  const router = useRouter();
  const colors = useThemeColors();
  const detail = useIssueDetail(host.hostId, issueId);
  const view = useIssueView(host.hostId, { cached: true }).data;
  const issue =
    detail.data?.issue ?? view?.issues.find((entry) => entry.id === issueId);
  const settled = useTransitionSettled();

  if (!settled) return <PendingIndicator />;

  if (detail.data === null) return <ListNotice title={t("missing")} />;
  if (!issue) {
    if (!detail.error) return <PendingIndicator />;
    return (
      <ListNotice
        title={t("unavailable.title", { host: host.name })}
        action={{
          label: t("unavailable.retry"),
          onPress: () => void detail.mutate(),
        }}
      />
    );
  }

  const children = detail.data?.children ?? [];
  const sessions = detail.data?.sessions ?? [];
  const doneChildren = children.filter(
    (child) => child.statusCategory === "completed",
  ).length;
  const description = issue.description?.trim() ?? "";

  return (
    <>
      <Stack.Screen options={{ title: issue.identifier }} />
      <HeaderButtons
        items={[
          {
            key: "edit",
            icon: { ios: "pencil", android: "edit" },
            label: t("edit.action"),
            hidden: !host.scopes.includes("interact") || !detail.data,
            onPress: () =>
              router.push({
                pathname: "/edit-issue/[hostId]/[issueId]",
                params: { hostId: host.hostId, issueId: issue.id },
              }),
          },
        ]}
      />
      <Form>
        <FormSection
          header={
            <View style={styles.header}>
              <Text
                accessibilityRole="header"
                selectable
                style={[styles.title, { color: colors.foreground }]}
              >
                {issue.title}
              </Text>
              <IssueFields host={host} issue={issue} view={view ?? undefined} />
              {description ? (
                <MarkdownText
                  markdown={description}
                  reading
                  hostId={host.hostId}
                  testID="issue-description"
                />
              ) : null}
            </View>
          }
        />
        {sessions.length > 0 ? (
          <FormSection title={t("sessions")}>
            {sessions.map((session) => (
              <FormRow
                key={session.sessionId}
                testID={`issue-session-${session.sessionId}`}
                onPress={() =>
                  router.push({
                    pathname: "/session/[hostId]/[sessionId]",
                    params: {
                      hostId: host.hostId,
                      sessionId: session.sessionId,
                    },
                  })
                }
              >
                {session.title ?? t("untitledSession")}
              </FormRow>
            ))}
          </FormSection>
        ) : null}
        {children.length > 0 ? (
          <FormSection
            title={t("subIssues", {
              done: doneChildren,
              total: children.length,
            })}
          >
            {children.map((child) => (
              <SubIssueRow
                key={child.id}
                issue={child}
                onPress={() =>
                  router.push({
                    pathname: "/issue/[hostId]/[issueId]",
                    params: { hostId: host.hostId, issueId: child.id },
                  })
                }
              />
            ))}
          </FormSection>
        ) : null}
        <LinkedEntitiesSection
          hostId={host.hostId}
          entity={{ kind: "issue", id: issue.id }}
          hideLink={isShownAsIssueStructure}
        />
      </Form>
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: space.sm, gap: space.md },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "600" },
});
