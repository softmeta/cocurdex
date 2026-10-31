import type { IssueStatusCategory } from "@cocurdex/shared";
import { SymbolView } from "expo-symbols";
import { type ThemeColors, useThemeColors } from "@/theme";

type Glyph = {
  name: { ios: string; android: string };
  color: keyof ThemeColors;
};

const GLYPHS = {
  backlog: {
    name: { ios: "circle.dashed", android: "pending" },
    color: "mutedForeground",
  },
  unstarted: {
    name: { ios: "circle", android: "radio_button_unchecked" },
    color: "mutedForeground",
  },
  started: {
    name: { ios: "circle.lefthalf.filled", android: "contrast" },
    color: "statusWarning",
  },
  completed: {
    name: { ios: "checkmark.circle.fill", android: "check_circle" },
    color: "brandMark",
  },
  canceled: {
    name: { ios: "xmark.circle", android: "cancel" },
    color: "mutedForeground",
  },
  none: {
    name: { ios: "circle", android: "radio_button_unchecked" },
    color: "mutedForeground",
  },
} as const satisfies Record<IssueStatusCategory | "none", Glyph>;

export function IssueStatusMark({
  category,
  label,
}: {
  category: IssueStatusCategory | null;
  label: string;
}) {
  const colors = useThemeColors();
  const glyph = GLYPHS[category ?? "none"];
  return (
    <SymbolView
      accessibilityLabel={label}
      name={glyph.name}
      size={18}
      tintColor={colors[glyph.color]}
    />
  );
}
