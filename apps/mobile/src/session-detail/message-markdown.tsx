import { useMemo } from "react";
import { Linking, Platform } from "react-native";
import {
  EnrichedMarkdownText,
  type MarkdownStyle,
} from "react-native-enriched-markdown";
import {
  type SyntaxColors,
  space,
  type ThemeColors,
  useSyntaxColors,
  useThemeColors,
} from "@/theme";
import { externalLinkUrl } from "./external-link";

export const MONO_FONT = Platform.select({
  ios: "Menlo",
  default: "monospace",
});
const BODY_SIZE = 16;
const BODY_LINE_HEIGHT = 24;

function markdownStyle(
  colors: ThemeColors,
  syntaxColors: SyntaxColors,
): MarkdownStyle {
  const block = {
    fontSize: BODY_SIZE,
    lineHeight: BODY_LINE_HEIGHT,
    color: colors.foreground,
    marginBottom: space.sm,
  };
  return {
    paragraph: block,
    list: { ...block, bulletColor: colors.mutedForeground },
    h1: { ...block, fontSize: 22, lineHeight: 28, fontWeight: "700" },
    h2: { ...block, fontSize: 19, lineHeight: 26, fontWeight: "700" },
    h3: { ...block, fontSize: 17, lineHeight: 24, fontWeight: "600" },
    blockquote: {
      ...block,
      color: colors.mutedForeground,
      borderColor: colors.border,
      borderWidth: 3,
      gapWidth: space.md,
    },
    link: { color: colors.chatLink, underline: false },
    code: {
      fontFamily: MONO_FONT,
      fontSize: 14,
      color: colors.foreground,
      backgroundColor: colors.chatCodeInline,
    },
    codeBlock: {
      fontFamily: MONO_FONT,
      fontSize: 13,
      lineHeight: 19,
      color: colors.foreground,
      backgroundColor: colors.chatCodeBlock,
      borderColor: colors.chatBorder,
      borderWidth: 1,
      borderRadius: 8,
      padding: space.md,
      marginBottom: space.sm,
      syntaxColors,
    },
    table: {
      fontSize: 14,
      color: colors.foreground,
      borderColor: colors.chatBorder,
      headerBackgroundColor: colors.muted,
      headerTextColor: colors.foreground,
      borderRadius: 8,
      marginBottom: space.sm,
    },
    thematicBreak: { color: colors.border },
  };
}

export function MessageMarkdown({
  markdown,
  testID,
}: {
  markdown: string;
  testID?: string;
}) {
  const colors = useThemeColors();
  const syntaxColors = useSyntaxColors();
  const style = useMemo(
    () => markdownStyle(colors, syntaxColors),
    [colors, syntaxColors],
  );
  return (
    <EnrichedMarkdownText
      markdown={markdown}
      flavor="github"
      markdownStyle={style}
      selectable
      onLinkPress={({ url }) => {
        const target = externalLinkUrl(url);
        if (target) void Linking.openURL(target);
      }}
      testID={testID}
    />
  );
}
