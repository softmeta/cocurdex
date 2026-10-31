import type { SavedHost } from "@cocurdex/client-runtime";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AgentIcon } from "@/agents";
import { hostConnection } from "@/connection";
import {
  type ArchivedSessionRow,
  archivedSessionRows,
  reloadArchivedSessions,
  sessionsStore,
  useArchivedSessions,
  useHostSessions,
} from "@/sessions";
import { layout, space, useThemeColors } from "@/theme";
import {
  ListNotice,
  useAgeLabel,
  useScrollIndicatorWhileScrolling,
} from "@/ui";
import { useAgentLabels } from "./settings-queries";

function ArchivedRow({
  row,
  agentLabel,
  restoring,
  onRestore,
}: {
  row: ArchivedSessionRow;
  agentLabel: string;
  restoring: boolean;
  onRestore(): void;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const age = useAgeLabel(row.archivedAt);
  const meta = [
    agentLabel,
    row.workspaceName,
    t("archived.archivedAge", { age }),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.row} testID={`archived-row-${row.id}`}>
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground }]}
        >
          {row.title}
        </Text>
        <View style={styles.metaLine}>
          <AgentIcon agentId={row.agentType} size={14} />
          <Text
            numberOfLines={1}
            style={[styles.meta, { color: colors.mutedForeground }]}
          >
            {meta}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("archived.restoreSession", { title: row.title })}
        accessibilityState={{ disabled: restoring }}
        disabled={restoring}
        hitSlop={space.sm}
        onPress={onRestore}
        style={({ pressed }) => [
          styles.restore,
          { backgroundColor: colors.muted },
          (pressed || restoring) && styles.dimmed,
        ]}
      >
        <Text style={[styles.restoreLabel, { color: colors.foreground }]}>
          {t("archived.restore")}
        </Text>
      </Pressable>
    </View>
  );
}

export function ArchivedSessionsScreen({ host }: { host: SavedHost }) {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const { workspaces } = useHostSessions(host.hostId);
  const archived = useArchivedSessions(host.hostId);
  const labels = useAgentLabels(host.hostId);
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const rows = archivedSessionRows(archived.data ?? [], workspaces);
  const restore = async (sessionId: string) => {
    setFailed(false);
    setRestoring((current) => new Set(current).add(sessionId));
    try {
      await hostConnection(host.hostId).request("session.restore", {
        sessionId,
      });
      await Promise.all([
        sessionsStore(host.hostId).reload(),
        reloadArchivedSessions(host.hostId),
      ]);
    } catch {
      setFailed(true);
    } finally {
      setRestoring((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
  };
  return (
    <FlatList
      {...scrollIndicator}
      data={rows}
      keyExtractor={(row) => row.id}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        rows.length > 0 ? (
          <Text
            style={[
              styles.count,
              { color: failed ? colors.destructive : colors.mutedForeground },
            ]}
          >
            {failed
              ? t("detail.actionFailed")
              : t("archived.count", { count: rows.length })}
          </Text>
        ) : undefined
      }
      ListEmptyComponent={
        archived.data ? (
          <ListNotice
            icon={{ ios: "archivebox", android: "archive" }}
            title={t("archived.empty")}
          />
        ) : undefined
      }
      renderItem={({ item }) => (
        <ArchivedRow
          row={item}
          agentLabel={labels.get(item.agentType) ?? item.agentType}
          restoring={restoring.has(item.id)}
          onRestore={() => void restore(item.id)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  count: {
    fontSize: 13,
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.md,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 22 },
  metaLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { flex: 1, fontSize: 13, lineHeight: 18 },
  restore: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: space.md,
    justifyContent: "center",
  },
  restoreLabel: { fontSize: 14, fontWeight: "500" },
  dimmed: { opacity: 0.5 },
});
