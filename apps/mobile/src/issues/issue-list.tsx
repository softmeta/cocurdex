import {
  ALL_ISSUE_PLACE,
  isSameIssuePlace,
  matchesIssuePlace,
  type SavedHost,
} from "@cocurdex/client-runtime";
import type { IssueStatusCategory } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionList, StyleSheet } from "react-native";
import { useHostSessions } from "@/sessions";
import {
  ListNotice,
  ListSectionHeader,
  PendingIndicator,
  usePullToRefresh,
  useScrollIndicatorWhileScrolling,
  useTabBarInset,
} from "@/ui";
import { useIssueActions } from "./issue-actions";
import { useIssueActivityLookup } from "./issue-agent-activity";
import {
  setIssueFilters,
  setIssuePlace,
  useIssueFilters,
  useIssuePlace,
} from "./issue-filter-store";
import {
  activeIssueFilterCount,
  EMPTY_ISSUE_FILTERS,
  issueMatchesFilters,
} from "./issue-filters";
import { IssuePlaceTabs } from "./issue-place-tabs";
import { useIssueView } from "./issue-queries";
import { IssueRowView } from "./issue-row";
import { issueSections } from "./issue-sections";

const COLLAPSED_BY_DEFAULT: ReadonlySet<IssueStatusCategory | null> = new Set([
  "completed",
  "canceled",
]);

export function IssueList({ host, query }: { host: SavedHost; query: string }) {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const tabBarInset = useTabBarInset();
  const { t } = useTranslation("issues");
  const router = useRouter();
  const view = useIssueView(host.hostId);
  const data = view.data;
  const pull = usePullToRefresh(() => view.mutate());
  const issueActions = useIssueActions(host);
  const filters = useIssueFilters(host.hostId);
  const storedPlace = useIssuePlace(host.hostId);
  const { workspaces } = useHostSessions(host.hostId);
  const activityOf = useIssueActivityLookup(host.hostId);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const searching = query.trim() !== "";
  const place = searching ? ALL_ISSUE_PLACE : storedPlace;
  const sections = useMemo(
    () =>
      data
        ? issueSections(
            data.issues,
            data.statusOptions,
            filters,
            place,
            query,
            activityOf,
          ).map((section) => {
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
          })
        : [],
    [data, filters, place, query, searching, toggled, activityOf],
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
    const placed =
      data?.issues.some((issue) =>
        matchesIssuePlace(issue, place, activityOf),
      ) ?? false;
    if (!placed && !isSameIssuePlace(place, ALL_ISSUE_PLACE)) {
      return (
        <ListNotice
          icon={{ ios: "checklist", android: "checklist" }}
          title={t("place.empty")}
          action={{
            label: t("place.showAll"),
            onPress: () => setIssuePlace(host.hostId, ALL_ISSUE_PLACE),
          }}
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
      {searching || data.issues.length === 0 ? null : (
        <IssuePlaceTabs
          issues={data.issues}
          filtered={data.issues.filter((issue) =>
            issueMatchesFilters(issue, filters),
          )}
          workspaces={workspaces}
          place={place}
          activityOf={activityOf}
          onSelect={(next) => setIssuePlace(host.hostId, next)}
        />
      )}
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
            onActions={(anchor) => issueActions.open(item, anchor)}
          />
        )}
      />
      {issueActions.menu}
      {issueActions.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
