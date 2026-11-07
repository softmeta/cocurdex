import type {
  BriefRoutineResult,
  InboxItem,
  PersonalAgentRecord,
} from "@cocurdex/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleAvatar } from "@/agents";
import { layout, space, useThemeColors } from "@/theme";
import { useAgeLabel } from "@/ui";
import { inboxKindColor, inboxKindLabel } from "./inbox-kind";

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

function Dot({ color, label }: { color: string; label?: string }) {
  return (
    <View
      accessible={Boolean(label)}
      accessibilityLabel={label}
      accessibilityRole={label ? "image" : undefined}
      style={styles.dotSlot}
    >
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

export function InboxRow({
  item,
  onOpen,
}: {
  item: InboxItem;
  onOpen(item: InboxItem): void;
}) {
  const { t } = useTranslation("assistant");
  const colors = useThemeColors();
  const age = useAgeLabel(item.at);
  const kind = inboxKindLabel(t, item.kind);
  const detail = item.detail ? `${kind} · ${item.detail}` : kind;
  return (
    <RowPressable
      label={item.title}
      onPress={() => onOpen(item)}
      testID={`inbox-item-${item.id}`}
      value={[detail, age].join(", ")}
    >
      <View style={styles.line}>
        <Dot color={colors[inboxKindColor(item.kind)]} label={kind} />
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground }]}
        >
          {item.title}
        </Text>
        <Text style={[styles.age, { color: colors.mutedForeground }]}>
          {age}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={[styles.detail, { color: colors.mutedForeground }]}
      >
        {detail}
      </Text>
    </RowPressable>
  );
}

export function AgentRow({
  agent,
  subtitle,
  onOpen,
}: {
  agent: PersonalAgentRecord;
  subtitle: string;
  onOpen(agent: PersonalAgentRecord): void;
}) {
  const colors = useThemeColors();
  return (
    <RowPressable
      label={agent.role.name}
      onPress={() => onOpen(agent)}
      testID={`assistant-${agent.id}`}
      value={subtitle}
    >
      <View style={styles.agentLine}>
        <RoleAvatar role={agent.role} size={layout.avatarTile} />
        <View style={styles.agentText}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: colors.foreground }]}
          >
            {agent.role.name}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={[styles.agentDetail, { color: colors.mutedForeground }]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </RowPressable>
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
  title: { flex: 1, fontSize: 16, lineHeight: 22 },
  age: { fontSize: 13, fontVariant: ["tabular-nums"] },
  detail: { fontSize: 14, lineHeight: 19, paddingLeft: 16 + space.sm },
  agentDetail: { fontSize: 14, lineHeight: 19 },
  dotSlot: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
