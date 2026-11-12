import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { RoleAvatar, type RoleAvatarSource } from "@/agents";
import { MarkdownText } from "@/markdown";
import { layout, space, type ThemeColors } from "@/theme";
import { ShimmerText } from "@/ui";
import { PostedSourceLine } from "./posted-source-line";
import type { CondensedItem } from "./transcript-activity";

type ConversationItem = Extract<
  CondensedItem,
  { kind: "assistant" } | { kind: "activity" }
>;

export function WorkingLine({
  colors,
  role,
}: {
  colors: ThemeColors;
  role: RoleAvatarSource | null;
}) {
  const { t } = useTranslation("sessions");
  return (
    <View style={styles.working} accessibilityLiveRegion="polite">
      {role ? <RoleAvatar role={role} size={18} /> : null}
      <ShimmerText
        text={t("detail.working")}
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
}: {
  item: ConversationItem;
  colors: ThemeColors;
  hostId: string;
  fileRoot: string | null | undefined;
  role: RoleAvatarSource | null;
}) {
  if (item.kind === "activity")
    return <WorkingLine colors={colors} role={role} />;
  return (
    <View style={styles.reply}>
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
  working: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  workingText: { fontSize: 14 },
});
