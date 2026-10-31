import { Platform } from "react-native";

const IOS_ROUNDED_GROUPS_VERSION = 26;

function iosGroupRadius() {
  const major = Number.parseInt(String(Platform.Version), 10);
  return major >= IOS_ROUNDED_GROUPS_VERSION ? 26 : 10;
}

export const formMetrics = Platform.select({
  ios: {
    pagePadding: 16,
    sectionGap: 35,
    rowMinHeight: 44,
    rowPaddingVertical: 11,
    rowGap: 0,
    outerRadius: iosGroupRadius(),
    innerRadius: 0,
    separator: true,
    bodySize: 17,
    bodyLineHeight: 22,
    supportingSize: 15,
    supportingLineHeight: 20,
    noteSize: 13,
    noteLineHeight: 18,
    titleSize: 13,
    titleLineHeight: 18,
    titleWeight: "400",
    titleUppercase: true,
    titleGap: 7,
    noteGap: 7,
  },
  default: {
    pagePadding: 16,
    sectionGap: 24,
    rowMinHeight: 56,
    rowPaddingVertical: 12,
    rowGap: 2,
    outerRadius: 20,
    innerRadius: 4,
    separator: false,
    bodySize: 16,
    bodyLineHeight: 24,
    supportingSize: 14,
    supportingLineHeight: 20,
    noteSize: 14,
    noteLineHeight: 20,
    titleSize: 16,
    titleLineHeight: 24,
    titleWeight: "500",
    titleUppercase: false,
    titleGap: 8,
    noteGap: 4,
  },
} as const);
