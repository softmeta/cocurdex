import type { SavedHost } from "@cocurdex/client-runtime";
import type { IssueStatusCategory } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { type ReactElement, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionList, StyleSheet } from "react-native";
import {
  ListNotice,
  ListSectionHeader,
  PendingIndicator,
  usePullToRefresh,
  useScrollIndicatorWhileScrolling,
  useTabBarInset,
} from "@/ui";
import { setIssueFilters, useIssueFilters } from "./issue-filter-store";
import { activeIssueFilterCount, EMPTY_ISSUE_FILTERS } from "./issue-filters";
import { useIssueMove } from "./issue-move";
import { useIssueView } from "./issue-queries";
import { IssueRowView } from "./issue-row";
import { issueSections } from "./issue-sections";

const COLLAPSED_BY_DEFAULT: ReadonlySet<IssueStatusCategory | null> = new Set([
  "completed",
  "canceled",
]);

export function IssueList({
  host,
  query,
  header,
}: {
  host: SavedHost;
  query: string;
  header?: ReactElement;
}) {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const tabBarInset = useTabBarInset();
  const { t } = useTranslation("issues");
  const router = useRouter();
  const view = useIssueView(host.hostId);
  const data = view.data;
  const pull = usePullToRefresh(() => view.mutate());
  const issueMove = useIssueMove(host);
  const filters = useIssueFilters(host.hostId);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const searching = query.trim() !== "";
  const sections = useMemo(
    () =>
      data
        ? issueSections(data.issues, data.statusOptions, filters, query).map(
            (section) => {
              const collapsed =
                !searching &&
                COLLAPSED_BY_DEFAULT.has(section.status.category) !==
                  toggled.has(section.status.id);
              return {
                key: section.status.id,
                status: section.status,
                issues: section.issues,
                collapsed,
                data: collapsed ? [] : section.issues,
              };
            },
          )
        : [],
    [data, filters, query, searching, toggled],
  );
  const toggle = (statusId: string) =>
    setToggled((current) => {
      const next = new Set(current);
      if (!next.delete(statusId)) next.add(statusId);
      return next;
    });
  const labelNames = useMemo(
    () => new Map(data?.labels.map((label) => [label.id, label.name]) ?? []),
    [data],
  );

  if (!data) {
    if (data === undefined && !view.error) return <PendingIndicator />;
    return (
      <ListNotice
        icon={{ ios: "wifi.slash", android: "cloud_off" }}
        title={t("unavailable.title", { host: host.name })}
        action={{
          label: t("unavailable.retry"),
          onPress: () => void view.mutate(),
        }}
      />
    );
  }

  function emptyNotice() {
    if (searching) {
      return (
        <ListNotice
          icon={{ ios: "magnifyingglass", android: "search" }}
          title={t("noResults", { query: query.trim() })}
        />
      );
    }
    if (activeIssueFilterCount(filters) > 0) {
      return (
        <ListNotice
          icon={{
            ios: "line.3.horizontal.decrease.circle",
            android: "filter_list",
          }}
          title={t("filter.empty")}
          action={{
            label: t("filter.clear"),
            onPress: () => setIssueFilters(host.hostId, EMPTY_ISSUE_FILTERS),
          }}
        />
      );
    }
    return (
      <ListNotice
        icon={{ ios: "checklist", android: "checklist" }}
        title={t("empty.title")}
        description={t("empty.description", { host: host.name })}
      />
    );
  }

  return (
    <>
      <SectionList
        {...scrollIndicator}
        contentContainerStyle={{ paddingBottom: tabBarInset }}
        style={styles.fill}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        sections={sections}
        keyExtractor={(issue) => issue.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        ListEmptyComponent={emptyNotice()}
        renderSectionHeader={({ section }) => (
          <ListSectionHeader
            title={section.status.title}
            count={section.issues.length}
            collapsed={section.collapsed}
            onToggle={() => toggle(section.status.id)}
            testID={`issue-section-${section.status.id}`}
          />
        )}
        renderItem={({ item, section }) => (
          <IssueRowView
            issue={item}
            statusTitle={section.status.title}
            labelNames={item.labelIds.flatMap((id) => labelNames.get(id) ?? [])}
            onPress={() =>
              router.push({
                pathname: "/issue/[hostId]/[issueId]",
                params: { hostId: host.hostId, issueId: item.id },
              })
            }
            onMove={(anchor) =>
              issueMove.open(item, data.statusOptions, anchor)
            }
          />
        )}
      />
      {issueMove.menu}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
