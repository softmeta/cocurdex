import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { space, useThemeColors, useThemeName } from "@/theme";
import { PendingIndicator } from "@/ui";
import { DiagramPreview } from "./diagram-preview";
import { useDiagram } from "./mermaid-store";

const PLACEHOLDER_HEIGHT = 160;

function DiagramPlaceholder() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLabel={t("markdown.diagram")}
      testID="mermaid-pending"
      style={[styles.pending, { backgroundColor: colors.muted }]}
    >
      <PendingIndicator />
    </View>
  );
}

export function MermaidDiagram({
  source,
  fallback,
}: {
  source: string;
  fallback: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const appearance = useThemeName();
  const entry = useDiagram(source, appearance);
  if (entry?.kind === "failed") return fallback;
  if (!entry) return <DiagramPlaceholder />;
  const { width, height } = entry.diagram;
  return (
    <View style={[styles.frame, { maxWidth: width }]}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={t("markdown.diagram")}
        accessibilityHint={t("markdown.openDiagram")}
        testID="mermaid-diagram"
        onPress={() =>
          router.push({
            pathname: "/diagram/[diagramId]",
            params: { diagramId: entry.id },
          })
        }
        style={[styles.fill, { aspectRatio: width / height }]}
      >
        <DiagramPreview diagram={entry.diagram} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pending: {
    height: PLACEHOLDER_HEIGHT,
    borderRadius: 8,
    marginBottom: space.sm,
  },
  frame: { width: "100%", alignSelf: "center", marginBottom: space.sm },
  fill: { width: "100%" },
});
