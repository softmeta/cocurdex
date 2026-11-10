import type { SavedHost } from "@cocurdex/client-runtime";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  hostAddress,
  selectHost,
  useCurrentHost,
  useSavedHosts,
} from "@/hosts";
import { layout, space, useThemeColors } from "@/theme";
import {
  type MenuAnchor,
  menuAnchor,
  useScrollIndicatorWhileScrolling,
} from "@/ui";
import { useComputerActions } from "./computer-actions-menu";
import { refreshHostReachability } from "./host-reachability";
import { HostStatus, useHostStatusLabel } from "./host-status";

function HostRow({
  host,
  current,
  onMore,
}: {
  host: SavedHost;
  current: boolean;
  onMore(anchor: MenuAnchor): void;
}) {
  const { t } = useTranslation("hosts");
  const colors = useThemeColors();
  const address = hostAddress(host);
  const status = useHostStatusLabel(host.hostId);
  const detail = `${status} · ${address}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={host.name}
      accessibilityValue={{
        text: current ? `${detail}, ${t("list.current")}` : detail,
      }}
      accessibilityState={{ selected: current }}
      onPress={() => selectHost(host.hostId)}
      onLongPress={(event) => onMore(menuAnchor(event))}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.muted },
      ]}
      testID={`host-row-${host.hostId}`}
    >
      <View style={[styles.tile, { backgroundColor: colors.muted }]}>
        <SymbolView
          name={{ ios: "laptopcomputer", android: "computer" }}
          size={18}
          tintColor={colors.foreground}
        />
      </View>
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground }]}
        >
          {host.name}
        </Text>
        <View style={styles.detailLine}>
          <HostStatus hostId={host.hostId} />
          <Text
            numberOfLines={1}
            style={[styles.detail, { color: colors.mutedForeground }]}
          >
            {detail}
          </Text>
        </View>
      </View>
      {current ? (
        <SymbolView
          name={{ ios: "checkmark", android: "check" }}
          size={18}
          tintColor={colors.tint}
        />
      ) : null}
    </Pressable>
  );
}

export function HostsList() {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const saved = useSavedHosts();
  const current = useCurrentHost();
  const actions = useComputerActions();
  const colors = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshHostReachability();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <>
      <FlatList
        {...scrollIndicator}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.mutedForeground}
            colors={[colors.mutedForeground]}
            progressBackgroundColor={colors.background}
          />
        }
        style={styles.fill}
        contentInsetAdjustmentBehavior="automatic"
        data={saved}
        keyExtractor={(host) => host.hostId}
        renderItem={({ item }) => (
          <HostRow
            host={item}
            current={item.hostId === current?.hostId}
            onMore={(anchor) =>
              actions.open(item, item.hostId === current?.hostId, anchor)
            }
          />
        )}
      />
      {actions.menu}
      {actions.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingLeft: layout.sideMargin,
    paddingRight: layout.sideMargin,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 22 },
  detailLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  detail: { flexShrink: 1, fontSize: 14, lineHeight: 19 },
});
