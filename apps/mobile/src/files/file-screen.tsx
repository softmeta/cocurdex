import type { SavedHost } from "@cocurdex/client-runtime";
import { pathBaseName, workspaceImageMimeType } from "@cocurdex/shared";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MarkdownText } from "@/markdown";
import { layout, space, useThemeColors, useThemeName } from "@/theme";
import {
  HeaderButtons,
  ListNotice,
  PendingIndicator,
  useScrollIndicatorWhileScrolling,
  useTransitionSettled,
} from "@/ui";
import {
  FileLoadError,
  type FileLoadFailure,
  useFileContent,
  workspaceFileSource,
} from "@/workspace-files";
import { isMarkdownFile, sourceLanguage } from "./source-language";
import { SourceView } from "./source-view";

const MAX_ZOOM = 4;

function ImageFile({ host, filePath }: { host: SavedHost; filePath: string }) {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const { width, height } = useWindowDimensions();
  const [loaded, setLoaded] = useState(false);
  return (
    <ScrollView
      {...scrollIndicator}
      style={styles.fill}
      contentContainerStyle={styles.center}
      maximumZoomScale={MAX_ZOOM}
      minimumZoomScale={1}
      centerContent
      contentInsetAdjustmentBehavior="automatic"
    >
      <Image
        accessibilityLabel={pathBaseName(filePath)}
        testID="file-image"
        resizeMode="contain"
        source={workspaceFileSource(host, filePath)}
        style={{ width, height: height * 0.75 }}
        onLoadEnd={() => setLoaded(true)}
      />
      {loaded ? null : (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PendingIndicator />
        </View>
      )}
    </ScrollView>
  );
}

function useFailureText(): Record<FileLoadFailure, string> {
  const { t } = useTranslation("files");
  return {
    outside: t("outside"),
    missing: t("missing"),
    failed: t("failed"),
  };
}

const SOURCE_ICON = {
  ios: "chevron.left.forwardslash.chevron.right",
  android: "code",
} as const;
const PREVIEW_ICON = { ios: "eye", android: "visibility" } as const;

function FileToolbar({
  markdown,
  preview,
  text,
  onTogglePreview,
}: {
  markdown: boolean;
  preview: boolean;
  text: string | null;
  onTogglePreview(): void;
}) {
  const { t } = useTranslation("files");
  return (
    <HeaderButtons
      items={[
        {
          key: "preview",
          icon: preview ? SOURCE_ICON : PREVIEW_ICON,
          label: preview ? t("showSource") : t("showPreview"),
          hidden: !markdown,
          disabled: text === null,
          onPress: onTogglePreview,
        },
        {
          key: "copy",
          icon: { ios: "doc.on.doc", android: "content_copy" },
          label: t("copy"),
          disabled: text === null,
          onPress: () => {
            if (text !== null) void Clipboard.setStringAsync(text);
          },
        },
      ]}
    />
  );
}

function TextFile({
  host,
  filePath,
  line,
}: {
  host: SavedHost;
  filePath: string;
  line: number | null;
}) {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const { t } = useTranslation("files");
  const colors = useThemeColors();
  const scheme = useThemeName();
  const content = useFileContent(host, filePath);
  const settled = useTransitionSettled();
  const failures = useFailureText();
  const markdown = isMarkdownFile(pathBaseName(filePath));
  const [preview, setPreview] = useState(markdown && line === null);
  const loaded = content.data?.kind === "text" ? content.data : null;
  const toolbar = (
    <FileToolbar
      markdown={markdown}
      preview={preview}
      text={loaded?.text ?? null}
      onTogglePreview={() => setPreview((current) => !current)}
    />
  );

  if (content.data === undefined || !settled) {
    if (!content.error || !settled) {
      return (
        <>
          {toolbar}
          <PendingIndicator />
        </>
      );
    }
    const reason =
      content.error instanceof FileLoadError ? content.error.reason : "failed";
    return (
      <>
        {toolbar}
        <ListNotice
          title={failures[reason]}
          action={
            reason === "failed"
              ? { label: t("retry"), onPress: () => void content.mutate() }
              : undefined
          }
        />
      </>
    );
  }
  if (!loaded) {
    return (
      <>
        {toolbar}
        <ListNotice title={t("binary")} />
      </>
    );
  }
  const { text, lines, truncated } = loaded;
  const footer = truncated ? (
    <Text style={[styles.notice, { color: colors.mutedForeground }]}>
      {t("truncated")}
    </Text>
  ) : null;

  return (
    <>
      {toolbar}
      {preview ? (
        <ScrollView
          {...scrollIndicator}
          style={styles.fill}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.markdown}
          scrollsChildToFocus={false}
        >
          <MarkdownText
            markdown={text}
            hostId={host.hostId}
            testID="file-markdown"
          />
          {footer}
        </ScrollView>
      ) : (
        <SourceView
          fileKey={`${host.hostId}:${filePath}`}
          lines={lines}
          language={sourceLanguage(pathBaseName(filePath))}
          scheme={scheme}
          focusLine={line}
          footer={footer}
        />
      )}
    </>
  );
}

function SettledImageFile(props: { host: SavedHost; filePath: string }) {
  const settled = useTransitionSettled();
  return settled ? <ImageFile {...props} /> : <PendingIndicator />;
}

export function FileScreen({
  host,
  filePath,
  line,
}: {
  host: SavedHost;
  filePath: string;
  line: number | null;
}) {
  return workspaceImageMimeType(filePath) ? (
    <SettledImageFile host={host} filePath={filePath} />
  ) : (
    <TextFile host={host} filePath={filePath} line={line} />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  markdown: {
    paddingHorizontal: layout.sideMargin,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
  },
  notice: {
    fontSize: 13,
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.md,
  },
});
