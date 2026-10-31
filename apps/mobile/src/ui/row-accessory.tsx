import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { space, useThemeColors } from "@/theme";
import { formMetrics } from "./form-metrics";
import { FormRow } from "./form-row";

export function Decorative({ children }: { children: ReactNode }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}

export function SelectedMark({ selected }: { selected: boolean }) {
  const colors = useThemeColors();
  if (!selected) return null;
  return (
    <SymbolView
      name={{ ios: "checkmark", android: "check" }}
      size={18}
      tintColor={colors.tint}
    />
  );
}

export function RowValue({
  value,
  detail,
  icon,
}: {
  value: string;
  detail?: string | null;
  icon?: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <View style={styles.values}>
        <View style={styles.valueLine}>
          {icon}
          <Text
            numberOfLines={1}
            style={[styles.value, { color: colors.mutedForeground }]}
          >
            {value}
          </Text>
        </View>
        {detail ? (
          <Text
            numberOfLines={1}
            style={[styles.detail, { color: colors.mutedForeground }]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      <Decorative>
        <SymbolView
          name={{ ios: "chevron.right", android: "chevron_right" }}
          size={13}
          tintColor={colors.mutedForeground}
        />
      </Decorative>
    </View>
  );
}

export function FolderIcon() {
  const colors = useThemeColors();
  return (
    <Decorative>
      <SymbolView
        name={{ ios: "folder", android: "folder" }}
        size={20}
        tintColor={colors.mutedForeground}
      />
    </Decorative>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  valueLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  values: { flexShrink: 1, alignItems: "flex-end" },
  value: {
    flexShrink: 1,
    fontSize: formMetrics.bodySize,
    lineHeight: formMetrics.bodyLineHeight,
  },
  detail: {
    fontSize: formMetrics.noteSize,
    lineHeight: formMetrics.noteLineHeight,
  },
});

export function ValueFormRow({
  testID,
  label,
  value,
  detail,
  icon,
  onPress,
}: {
  testID: string;
  label: string;
  value: string;
  detail?: string | null;
  icon?: ReactNode;
  onPress(): void;
}) {
  return (
    <FormRow
      testID={testID}
      onPress={onPress}
      trailing={<RowValue value={value} detail={detail} icon={icon} />}
    >
      {label}
    </FormRow>
  );
}
