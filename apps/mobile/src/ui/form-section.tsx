import { Children, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "@/theme";
import { formMetrics } from "./form-metrics";
import type { FormSectionProps } from "./form-props";
import { FormNote } from "./form-text";

function SectionTitle({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.title, { color: colors.mutedForeground }]}
    >
      {formMetrics.titleUppercase ? title.toLocaleUpperCase() : title}
    </Text>
  );
}

function SectionFooter({ footer }: { footer: ReactNode }) {
  return (
    <View style={styles.footer}>
      {typeof footer === "string" ? <FormNote>{footer}</FormNote> : footer}
    </View>
  );
}

export function FormSection({
  title,
  header,
  footer,
  children,
}: FormSectionProps) {
  const hasRows = Children.toArray(children).length > 0;
  return (
    <View>
      {header ? <View style={styles.header}>{header}</View> : null}
      {title && !header ? <SectionTitle title={title} /> : null}
      {hasRows ? (
        <View style={styles.group}>
          <View style={styles.rows}>{children}</View>
        </View>
      ) : null}
      {footer ? <SectionFooter footer={footer} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: formMetrics.pagePadding,
    paddingBottom: formMetrics.titleGap,
  },
  title: {
    fontSize: formMetrics.titleSize,
    lineHeight: formMetrics.titleLineHeight,
    fontWeight: formMetrics.titleWeight,
    paddingHorizontal: formMetrics.pagePadding,
    paddingBottom: formMetrics.titleGap,
  },
  group: { borderRadius: formMetrics.outerRadius, overflow: "hidden" },
  rows: {
    gap: formMetrics.rowGap,
    marginBottom: formMetrics.separator ? -StyleSheet.hairlineWidth : 0,
  },
  footer: {
    paddingHorizontal: formMetrics.pagePadding,
    paddingTop: formMetrics.noteGap,
  },
});
