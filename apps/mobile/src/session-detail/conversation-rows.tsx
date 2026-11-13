import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { RoleAvatar, type RoleAvatarSource } from "@/agents";
import { MarkdownText } from "@/markdown";
import { layout, space, type ThemeColors } from "@/theme";
import { ShimmerText } from "@/ui";
import type { SessionPresentation } from "./live-run";
import { PostedSourceLine } from "./posted-source-line";
import { TimeSeparator } from "./time-separator";
import type { CondensedItem } from "./transcript-activity";
import { TurnActions } from "./turn-actions";
import { liveLabel } from "./use-activity-label";
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

function useWaitingLabel(
  item: ActivityItem,
  presentation: Exclude<SessionPresentation, "work">,
) {
  const { t } = useTranslation("sessions");
  const elapsedMs = useElapsedMs(item.startedAt);
  if (presentation === "chat") return liveLabel(item.phase, t);
  if (item.items.length > 0) return t("live.handling");
  return assistantWaitLabel(elapsedMs, t);
}

export function WorkingLine({
  item,
  presentation,
  colors,
  role,
}: {
  item: ActivityItem;
  presentation: Exclude<SessionPresentation, "work">;
  colors: ThemeColors;
  role: RoleAvatarSource | null;
}) {
  const wanted = useWaitingLabel(item, presentation);
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
  presentation,
  colors,
  hostId,
  fileRoot,
  role,
}: {
  item: ConversationItem;
  presentation: Exclude<SessionPresentation, "work">;
  colors: ThemeColors;
  hostId: string;
  fileRoot: string | null | undefined;
  role: RoleAvatarSource | null;
}) {
  if (item.kind === "activity") {
    return (
      <WorkingLine
        item={item}
        presentation={presentation}
        colors={colors}
        role={role}
      />
    );
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
      <View
        style={[styles.bubble, { backgroundColor: colors.chatSurfaceBubble }]}
      >
        <MarkdownText
          markdown={item.text}
          streaming={item.streaming}
          hostId={hostId}
          fileRoot={fileRoot}
          testID={`transcript-assistant-${item.id}`}
        />
      </View>
      {item.turnEnd ? (
        <View style={styles.actions}>
          <TurnActions text={item.text} turn={item.turn} onFork={null} />
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
  actions: { paddingLeft: space.sm, paddingTop: space.xs },
  working: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  workingText: { fontSize: 14 },
});
