import type { BriefRoutineResult, PersonalAgentRecord } from "@cocurdex/shared";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleAvatar } from "@/agents";
import { type SessionRowStatus, SessionStatusMark } from "@/sessions";
import { layout, space, useThemeColors } from "@/theme";
import {
  type MenuAnchor,
  menuAnchor,
  useAgeLabel,
  useListTimeLabel,
} from "@/ui";

function RowPressable({
  label,
  value,
  disabled,
  testID,
  onPress,
  children,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  testID: string;
  onPress(): void;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityValue={{ text: value }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.muted },
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <View style={styles.dotSlot}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

export function BriefResultRow({
  result,
  onOpen,
}: {
  result: BriefRoutineResult;
  onOpen(sessionId: string): void;
}) {
  const colors = useThemeColors();
  const age = useAgeLabel(result.at);
  const { sessionId } = result;
  return (
    <RowPressable
      disabled={!sessionId}
      label={result.routineName}
      onPress={() => {
        if (sessionId) onOpen(sessionId);
      }}
      testID={`brief-result-${result.routineId}`}
      value={[result.summary, age].join(", ")}
    >
      <View style={styles.line}>
        <Dot color={colors.sidebarPrimary} />
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground }]}
        >
          {result.routineName}
        </Text>
        <Text style={[styles.age, { color: colors.mutedForeground }]}>
          {age}
        </Text>
      </View>
      <Text
        numberOfLines={3}
        style={[styles.detail, { color: colors.mutedForeground }]}
      >
        {result.summary}
      </Text>
    </RowPressable>
  );
}

export function AgentRow({
  agent,
  activityAt,
  status,
  subtitle,
  onOpen,
  onLongPress,
}: {
  agent: PersonalAgentRecord;
  activityAt: string | null;
  status: SessionRowStatus;
  subtitle: string;
  onOpen(agent: PersonalAgentRecord): void;
  onLongPress(agent: PersonalAgentRecord, anchor: MenuAnchor): void;
}) {
  const { t } = useTranslation("assistant");
  const colors = useThemeColors();
  const muted = agent.mutedAt !== null;
  return (
    <Pressable
      accessibilityLabel={agent.role.name}
      accessibilityRole="button"
      accessibilityValue={{ text: subtitle }}
      onPress={() => onOpen(agent)}
      onLongPress={(event) => onLongPress(agent, menuAnchor(event))}
      style={({ pressed }) => [
        styles.row,
        styles.agentLine,
        pressed && { backgroundColor: colors.muted },
      ]}
      testID={`assistant-${agent.id}`}
    >
      <RoleAvatar
        role={agent.role}
        size={layout.avatarTile}
        working={status === "running"}
      />
      <View style={styles.agentText}>
        <View style={styles.line}>
          <Text
            numberOfLines={1}
            style={[styles.agentName, { color: colors.foreground }]}
          >
            {agent.role.name}
          </Text>
          {muted ? (
            <SymbolView
              accessibilityLabel={t("agents.muted")}
              name={{ ios: "bell.slash", android: "notifications_off" }}
              size={14}
              tintColor={colors.mutedForeground}
            />
          ) : null}
          <View style={styles.fill} />
          {activityAt ? <ListTime timestamp={activityAt} /> : null}
        </View>
        <View style={styles.line}>
          <Text
            numberOfLines={1}
            style={[styles.agentDetail, { color: colors.mutedForeground }]}
          >
            {subtitle}
          </Text>
          <SessionStatusMark
            status={muted && status === "unread" ? "none" : status}
          />
        </View>
      </View>
    </Pressable>
  );
}

function ListTime({ timestamp }: { timestamp: string }) {
  const colors = useThemeColors();
  const label = useListTimeLabel(timestamp);
  if (!label) return null;
  return (
    <Text style={[styles.age, { color: colors.mutedForeground }]}>{label}</Text>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    justifyContent: "center",
    gap: 2,
    paddingVertical: space.md,
    paddingHorizontal: layout.sideMargin,
  },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  agentLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  agentText: { flex: 1, gap: 2 },
  agentName: { flexShrink: 1, fontSize: 16, lineHeight: 22 },
  fill: { flex: 1 },
  title: { flex: 1, fontSize: 16, lineHeight: 22 },
  age: { fontSize: 13, fontVariant: ["tabular-nums"] },
  detail: { fontSize: 14, lineHeight: 19, paddingLeft: 16 + space.sm },
  agentDetail: { flex: 1, fontSize: 14, lineHeight: 19 },
  dotSlot: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
