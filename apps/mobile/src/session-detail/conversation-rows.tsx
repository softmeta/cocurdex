import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { MarkdownText } from "@/markdown";
import { layout, type ThemeColors } from "@/theme";
import { ShimmerText } from "@/ui";
import { PostedSourceLine } from "./posted-source-line";
import type { CondensedItem } from "./transcript-activity";

type ConversationItem = Extract<
  CondensedItem,
  { kind: "assistant" } | { kind: "activity" }
>;

function WorkingLine({ colors }: { colors: ThemeColors }) {
  const { t } = useTranslation("sessions");
  return (
    <View style={styles.working} accessibilityLiveRegion="polite">
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
}: {
  item: ConversationItem;
  colors: ThemeColors;
  hostId: string;
  fileRoot: string | null | undefined;
}) {
  if (item.kind === "activity") return <WorkingLine colors={colors} />;
  return (
    <View style={styles.reply}>
      {item.source ? (
        <PostedSourceLine source={item.source} color={colors.mutedForeground} />
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
  working: { minHeight: 32, justifyContent: "center" },
  workingText: { fontSize: 14 },
});
