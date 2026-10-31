import { ScrollView, StyleSheet } from "react-native";
import { useGroupedColors } from "@/theme";
import { formMetrics } from "./form-metrics";
import type { FormProps } from "./form-props";

export function Form({ children, adjustsForKeyboard = false }: FormProps) {
  const grouped = useGroupedColors();
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: grouped.page }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets={adjustsForKeyboard}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: formMetrics.pagePadding,
    gap: formMetrics.sectionGap,
  },
});
