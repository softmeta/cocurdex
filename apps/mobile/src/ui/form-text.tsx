import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { type ThemeColors, useThemeColors } from "@/theme";
import { formMetrics } from "./form-metrics";

export type FormTextTone = "default" | "muted" | "tint" | "destructive";

function toneColor(colors: ThemeColors, tone: FormTextTone) {
  const tones: Record<FormTextTone, string> = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    tint: colors.tint,
    destructive: colors.destructive,
  };
  return tones[tone];
}

export function FormText({
  children,
  tone = "default",
  numberOfLines,
}: {
  children: ReactNode;
  tone?: FormTextTone;
  numberOfLines?: number;
}) {
  const colors = useThemeColors();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.body, { color: toneColor(colors, tone) }]}
    >
      {children}
    </Text>
  );
}

export function FormSupportingText({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: FormTextTone;
}) {
  const colors = useThemeColors();
  return (
    <Text style={[styles.supporting, { color: toneColor(colors, tone) }]}>
      {children}
    </Text>
  );
}

export function FormNote({
  children,
  tone = "muted",
  testID,
}: {
  children: ReactNode;
  tone?: FormTextTone;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <Text
      testID={testID}
      style={[styles.note, { color: toneColor(colors, tone) }]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: formMetrics.bodySize,
    lineHeight: formMetrics.bodyLineHeight,
  },
  supporting: {
    fontSize: formMetrics.supportingSize,
    lineHeight: formMetrics.supportingLineHeight,
  },
  note: {
    fontSize: formMetrics.noteSize,
    lineHeight: formMetrics.noteLineHeight,
  },
});
