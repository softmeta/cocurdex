import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { RoleAvatar, type RoleAvatarSource } from "@/agents";
import { MarkdownText } from "@/markdown";
import { layout, space, type ThemeColors } from "@/theme";
import { type MenuAnchor, menuAnchor, ShimmerText } from "@/ui";
import { PostedSourceLine } from "./posted-source-line";
import { TimeSeparator } from "./time-separator";
import type { CondensedItem } from "./transcript-activity";
import { TurnMeta } from "./turn-actions";
import { useElapsedMs } from "./use-elapsed-label";
import { useSettledLabel } from "./use-settled-label";

type ConversationItem = Extract<
  CondensedItem,
  { kind: "assistant" } | { kind: "activity" }
>;
type ActivityItem = Extract<CondensedItem, { kind: "activity" }>;

const STILL_THINKING_AFTER_MS = 15_000;
const SLOW_RESPONSE_AFTER_MS = 40_000;

function assistantWaitLabel(elapsedMs: number, t: TFunction<"sessions">) {
  if (elapsedMs >= SLOW_RESPONSE_AFTER_MS) return t("live.slowResponse");
  if (elapsedMs >= STILL_THINKING_AFTER_MS) return t("live.stillThinking");
  return t("live.thinking");
}

function useWaitingLabel(item: ActivityItem) {
  const { t } = useTranslation("sessions");
  const elapsedMs = useElapsedMs(item.startedAt);
  if (item.items.length > 0) return t("live.handling");
  return assistantWaitLabel(elapsedMs, t);
}

export function WorkingLine({
  item,
  colors,
  role,
}: {
  item: ActivityItem;
  colors: ThemeColors;
  role: RoleAvatarSource | null;
}) {
  const wanted = useWaitingLabel(item);
  const label = useSettledLabel(wanted, wanted);
  return (
    <View style={styles.working} accessibilityLiveRegion="polite">
      {role ? <RoleAvatar role={role} size={18} working /> : null}
      <ShimmerText
        text={label}
        baseColor={colors.mutedForeground}
        highlightColor={colors.foreground}
        style={styles.workingText}
        testID="conversation-working"
      />
    </View>
  );
}

export function ConversationRow({
  item,
  colors,
  hostId,
  fileRoot,
  role,
  onActions,
}: {
  item: ConversationItem;
  colors: ThemeColors;
  hostId: string;
  fileRoot: string | null | undefined;
  role: RoleAvatarSource | null;
  onActions(text: string, anchor: MenuAnchor): void;
}) {
  if (item.kind === "activity") {
    return <WorkingLine item={item} colors={colors} role={role} />;
  }
  return (
    <View style={styles.reply}>
      {item.separatorTime === undefined ? null : (
        <TimeSeparator time={item.separatorTime} />
      )}
      {item.source ? (
        <PostedSourceLine
          source={item.source}
          color={colors.mutedForeground}
          hostId={hostId}
        />
      ) : null}
      <Pressable
        accessible={false}
        disabled={item.streaming}
        onLongPress={(event) => onActions(item.text, menuAnchor(event))}
        style={[styles.bubble, { backgroundColor: colors.chatSurfaceBubble }]}
        testID={`conversation-bubble-${item.id}`}
      >
        <MarkdownText
          markdown={item.text}
          streaming={item.streaming}
          hostId={hostId}
          fileRoot={fileRoot}
          testID={`transcript-assistant-${item.id}`}
        />
      </Pressable>
      {item.turnEnd && item.turn ? (
        <View style={styles.meta}>
          <TurnMeta turn={item.turn} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  reply: { alignItems: "flex-start" },
  bubble: {
    maxWidth: `${layout.bubbleMaxWidthRatio * 100}%`,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  meta: { paddingLeft: space.sm, paddingTop: space.xs },
  working: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  workingText: { fontSize: 14 },
});
