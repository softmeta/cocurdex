import { hidePendingTableStart } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { Linking, View } from "react-native";
import {
  EnrichedMarkdownText,
  type MarkdownStyle,
} from "react-native-enriched-markdown";
import { scaledSize, useCodeScale, useTextScale } from "@/preferences";
import {
  type SyntaxColors,
  space,
  type ThemeColors,
  useSyntaxColors,
  useThemeColors,
} from "@/theme";
import { preloadFileContent } from "@/workspace-files";
import { DocImage } from "./doc-image";
import { splitDocImages } from "./doc-image-segments";
import { entityLinkHref, entityLinkRef } from "./entity-link";
import { externalLinkUrl } from "./external-link";
import { useExistingFiles } from "./file-link-queries";
import {
  collectFileLinkTargets,
  linkFilePaths,
  localFileLinkTarget,
  padInlineCode,
  parseFileLinkHref,
} from "./file-links";
import { splitMermaidBlocks } from "./markdown-segments";
import { MermaidDiagram } from "./mermaid-diagram";
import { MONO_FONT } from "./mono-font";
import { type StreamingBlock, streamingBlocks } from "./streaming-blocks";

const BODY_SIZE = 16;
const BODY_LINE_HEIGHT = 24;
const INLINE_CODE_TINT_ALPHA = "1f";

function markdownStyle(
  colors: ThemeColors,
  syntaxColors: SyntaxColors,
  { text, code }: { text: number; code: number },
): MarkdownStyle {
  const textSize = (size: number) => scaledSize(size, text);
  const codeSize = (size: number) => scaledSize(size, code);
  const block = {
    fontSize: textSize(BODY_SIZE),
    lineHeight: textSize(BODY_LINE_HEIGHT),
    color: colors.foreground,
    marginBottom: space.sm,
  };
  return {
    paragraph: block,
    list: {
      ...block,
      bulletColor: colors.mutedForeground,
      markerColor: colors.mutedForeground,
    },
    h1: {
      ...block,
      fontSize: textSize(22),
      lineHeight: textSize(28),
      fontWeight: "600",
    },
    h2: {
      ...block,
      fontSize: textSize(19),
      lineHeight: textSize(26),
      fontWeight: "600",
    },
    h3: {
      ...block,
      fontSize: textSize(17),
      lineHeight: textSize(24),
      fontWeight: "500",
    },
    h4: { ...block, fontWeight: "600" },
    h5: {
      ...block,
      fontSize: textSize(15),
      lineHeight: textSize(22),
      fontWeight: "600",
    },
    h6: {
      ...block,
      fontSize: textSize(14),
      lineHeight: textSize(20),
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    blockquote: {
      ...block,
      color: colors.mutedForeground,
      borderColor: colors.border,
      borderWidth: 3,
      gapWidth: space.md,
      backgroundColor: "transparent",
    },
    link: { color: colors.chatLink, underline: false },
    strikethrough: { color: colors.mutedForeground },
    highlight: {
      color: colors.foreground,
      backgroundColor: `${syntaxColors.function}${INLINE_CODE_TINT_ALPHA}`,
    },
    spoiler: { color: colors.mutedForeground },
    math: {
      color: colors.foreground,
      backgroundColor: colors.chatCodeBlock,
      marginBottom: space.sm,
    },
    inlineMath: { color: colors.foreground },
    code: {
      fontFamily: MONO_FONT,
      fontSize: codeSize(14),
      color: syntaxColors.function,
      backgroundColor: `${syntaxColors.function}${INLINE_CODE_TINT_ALPHA}`,
      borderColor: `${syntaxColors.function}00`,
    },
    codeBlock: {
      fontFamily: MONO_FONT,
      fontSize: codeSize(13),
      lineHeight: codeSize(19),
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
      fontSize: textSize(14),
      color: colors.foreground,
      borderColor: colors.chatBorder,
      headerBackgroundColor: colors.muted,
      headerTextColor: colors.foreground,
      rowEvenBackgroundColor: colors.background,
      rowOddBackgroundColor: colors.muted,
      borderRadius: 8,
      marginBottom: space.sm,
    },
    taskList: {
      checkedColor: colors.tint,
      borderColor: colors.mutedForeground,
      checkmarkColor: colors.primaryForeground,
      checkedTextColor: colors.mutedForeground,
      checkedStrikethrough: true,
      checkboxSize: 18,
      checkboxBorderRadius: 9,
    },
    thematicBreak: { color: colors.border },
  };
}

function fileTargetOf(url: string, fileRoot: string | null | undefined) {
  return fileRoot === undefined
    ? parseFileLinkHref(url)
    : localFileLinkTarget(url, fileRoot);
}

export function useOpenLink(
  hostId: string | undefined,
  fileRoot: string | null | undefined,
) {
  const router = useRouter();
  return useCallback(
    (url: string) => {
      const external = externalLinkUrl(url);
      if (external) {
        void Linking.openURL(external);
        return;
      }
      const file = hostId ? fileTargetOf(url, fileRoot) : null;
      if (file && hostId) {
        preloadFileContent(hostId, file.path);
        router.push({
          pathname: "/file/[hostId]",
          params: {
            hostId,
            path: file.path,
            ...(file.line === null ? {} : { line: String(file.line) }),
          },
        });
        return;
      }
      const ref = entityLinkRef(url);
      const href = ref && hostId ? entityLinkHref(hostId, ref) : null;
      if (href) router.push(href);
    },
    [router, hostId, fileRoot],
  );
}

const MarkdownBlock = memo(function MarkdownBlock({
  markdown,
  streaming,
  style,
  onOpenLink,
}: {
  markdown: string;
  streaming: boolean;
  style: MarkdownStyle;
  onOpenLink(url: string): void;
}) {
  return (
    <EnrichedMarkdownText
      markdown={markdown}
      streamingAnimation={streaming}
      flavor="github"
      markdownStyle={style}
      selectable={false}
      enableTaskListItemToggle={false}
      onLinkPress={({ url }) => onOpenLink(url)}
    />
  );
});

function useFileLinkedMarkdown(
  markdown: string,
  hostId: string | undefined,
  fileRoot: string | null | undefined,
) {
  const linkable = hostId !== undefined && fileRoot !== undefined;
  const paths = useMemo(
    () =>
      linkable
        ? collectFileLinkTargets(markdown, fileRoot).map(
            (target) => target.path,
          )
        : [],
    [linkable, markdown, fileRoot],
  );
  const existing = useExistingFiles(hostId, paths);
  return useMemo(
    () => (linkable ? linkFilePaths(markdown, fileRoot, existing) : markdown),
    [linkable, markdown, fileRoot, existing],
  );
}

function SegmentView({
  block,
  streaming,
  style,
  hostId,
  onOpenLink,
}: {
  block: StreamingBlock;
  streaming: boolean;
  style: MarkdownStyle;
  hostId: string | undefined;
  onOpenLink(url: string): void;
}) {
  if (block.kind === "image") {
    return hostId ? (
      <DocImage hostId={hostId} fileName={block.fileName} alt={block.alt} />
    ) : null;
  }
  if (block.kind === "markdown") {
    return (
      <MarkdownBlock
        markdown={block.text}
        streaming={streaming}
        style={style}
        onOpenLink={onOpenLink}
      />
    );
  }
  return (
    <MermaidDiagram
      source={block.source}
      fallback={
        <MarkdownBlock
          markdown={`~~~~\n${block.source}\n~~~~`}
          streaming={false}
          style={style}
          onOpenLink={onOpenLink}
        />
      }
    />
  );
}

export function MarkdownText({
  markdown,
  streaming = false,
  hostId,
  fileRoot,
  testID,
}: {
  markdown: string;
  streaming?: boolean;
  hostId?: string;
  fileRoot?: string | null;
  testID?: string;
}) {
  const [split] = useState(streaming);
  const settled = streaming ? hidePendingTableStart(markdown) : markdown;
  const linked = useFileLinkedMarkdown(settled, hostId, fileRoot);
  const openLink = useOpenLink(hostId, fileRoot);
  const colors = useThemeColors();
  const syntaxColors = useSyntaxColors();
  const text = useTextScale();
  const code = useCodeScale();
  const style = useMemo(
    () => markdownStyle(colors, syntaxColors, { text, code }),
    [colors, syntaxColors, text, code],
  );
  const blocks = useMemo(
    () =>
      streamingBlocks(
        splitDocImages(splitMermaidBlocks(padInlineCode(linked))),
        { live: streaming, split },
      ),
    [linked, streaming, split],
  );
  return (
    <View testID={testID} style={{ gap: space.sm }}>
      {blocks.map((block) => (
        <SegmentView
          key={block.key}
          block={block}
          streaming={streaming}
          style={style}
          hostId={hostId}
          onOpenLink={openLink}
        />
      ))}
    </View>
  );
}
