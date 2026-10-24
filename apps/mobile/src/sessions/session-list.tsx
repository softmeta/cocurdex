import type { SavedHost } from "@cocurdex/client-runtime";
import { Button, Column, Text as UiText } from "@expo/ui";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SectionList, StyleSheet, Text, View } from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { BrandHost } from "@/ui";
import { SessionRowView } from "./session-row";
import { buildSessionSections, type SessionRow } from "./session-sections";
import { useHostSessions } from "./sessions";
import type { HostSessionsSnapshot } from "./sessions-store";

const OFFLINE_STATES = new Set<HostSessionsSnapshot["connection"]>([
  "retrying",
  "waiting",
]);

function Notice({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; onPress(): void };
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.notice}>
      <BrandHost matchContents={{ vertical: true }}>
        <Column alignment="center" spacing={space.md}>
          <UiText textStyle={{ fontWeight: "600" }}>{title}</UiText>
          {description ? (
            <UiText
              textStyle={{ color: colors.mutedForeground, textAlign: "center" }}
            >
              {description}
            </UiText>
          ) : null}
          {action ? (
            <Button label={action.label} onPress={action.onPress} />
          ) : null}
        </Column>
      </BrandHost>
    </View>
  );
}

function Separator() {
  const colors = useThemeColors();
  return (
    <View style={[styles.separator, { backgroundColor: colors.border }]} />
  );
}

export function SessionList({
  host,
  query,
  onReload,
}: {
  host: SavedHost;
  query: string;
  onReload(): void;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const router = useRouter();
  const snapshot = useHostSessions(host.hostId);
  const sections = useMemo(
    () =>
      buildSessionSections({
        workspaces: snapshot.workspaces,
        sessions: snapshot.sessions,
        attention: snapshot.attention,
        query,
      }).map((section) => ({ ...section, data: section.rows })),
    [snapshot.workspaces, snapshot.sessions, snapshot.attention, query],
  );

  if (!snapshot.loaded) {
    if (!snapshot.failed) return <View style={styles.fill} />;
    return (
      <Notice
        title={t("unavailable.title", { host: host.name })}
        description={t("unavailable.description")}
        action={{ label: t("unavailable.retry"), onPress: onReload }}
      />
    );
  }

  const offline = OFFLINE_STATES.has(snapshot.connection);
  const searching = query.trim() !== "";

  return (
    <SectionList<SessionRow>
      style={styles.fill}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      sections={sections}
      keyExtractor={(row) => row.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        offline ? (
          <Text style={[styles.offline, { color: colors.mutedForeground }]}>
            {t("offline", { host: host.name })}
          </Text>
        ) : undefined
      }
      ListEmptyComponent={
        searching ? (
          <Notice title={t("noResults", { query: query.trim() })} />
        ) : (
          <Notice
            title={t("empty.title")}
            description={t("empty.description", { host: host.name })}
          />
        )
      }
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
          style={[styles.sectionTitle, { color: colors.foreground }]}
        >
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <SessionRowView
          row={item}
          onPress={() =>
            router.push({
              pathname: "/session/[hostId]/[sessionId]",
              params: { hostId: host.hostId, sessionId: item.id },
            })
          }
        />
      )}
      ItemSeparatorComponent={Separator}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.xxl,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: layout.sideMargin,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    paddingHorizontal: layout.sideMargin,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  offline: {
    fontSize: 13,
    paddingHorizontal: layout.sideMargin,
    paddingTop: space.sm,
  },
});
