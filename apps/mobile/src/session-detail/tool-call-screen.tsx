import {
  type AgentToolCallLocation,
  type AgentToolCallRecord,
  resolveCandidatePath,
} from "@cocurdex/shared";
import * as Clipboard from "expo-clipboard";
import { Stack, useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSavedHosts } from "@/hosts";
import { scaledSize, useCodeScale } from "@/preferences";
import { useViewedSession } from "@/sessions";
import { layout, space, useThemeColors } from "@/theme";
import {
  HeaderButtons,
  useScrollIndicatorWhileScrolling,
  useTransitionSettled,
} from "@/ui";
import { preloadFileContent } from "@/workspace-files";
import { useSessionDetail } from "./session-detail-stores";
import { SessionTitle } from "./session-title";
import { sessionWorkspace, sessionWorkspacePath } from "./session-workspace";
import { useToolCallResult } from "./tool-call-queries";
import {
  toolCallDurationMs,
  toolCallInputText,
  toolCallOutputPlaceholder,
  toolCallOutputTail,
  toolCallResultSource,
} from "./tool-call-view";

function statusLabel(
  status: AgentToolCallRecord["status"],
  t: TFunction<"sessions">,
) {
  if (status === "completed") return t("tool.completed");
  if (status === "failed") return t("tool.failed");
  return t("tool.running");
}

function toolCallSubtitle(call: AgentToolCallRecord, t: TFunction<"sessions">) {
  const duration = toolCallDurationMs(call);
  const status = statusLabel(call.status, t);
  if (duration === null) return status;
  const seconds = (duration / 1000).toFixed(1);
  return `${status} · ${t("tool.duration", { seconds })}`;
}

const CODE_SIZE = 12.5;
const CODE_LINE_HEIGHT = 19;

function CodeSection({
  title,
  note,
  text,
  testID,
}: {
  title: string;
  note?: string | null;
  text: string;
  testID: string;
}) {
  const colors = useThemeColors();
  const codeScale = useCodeScale();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text
          accessibilityRole="header"
          style={[styles.sectionTitle, { color: colors.mutedForeground }]}
        >
          {title}
        </Text>
        {note ? (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            {note}
          </Text>
        ) : null}
      </View>
      <View style={[styles.code, { backgroundColor: colors.chatCodePanel }]}>
        <Text
          selectable
          testID={testID}
          style={[
            styles.codeText,
            {
              color: colors.foreground,
              fontSize: scaledSize(CODE_SIZE, codeScale),
              lineHeight: scaledSize(CODE_LINE_HEIGHT, codeScale),
            },
          ]}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

function locationLabel(location: AgentToolCallLocation) {
  const name = location.path.split(/[\\/]/).pop() || location.path;
  return location.line ? `${name}:${location.line}` : name;
}

function FilesSection({
  hostId,
  locations,
  root,
}: {
  hostId: string;
  locations: readonly AgentToolCallLocation[];
  root: string | null;
}) {
  const router = useRouter();
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.sectionTitle, { color: colors.mutedForeground }]}
      >
        {t("tool.files")}
      </Text>
      {locations.flatMap((location) => {
        const path = resolveCandidatePath(location.path, root);
        if (!path) return [];
        const label = locationLabel(location);
        return (
          <Pressable
            key={`${location.path}:${location.line ?? ""}`}
            accessibilityRole="link"
            accessibilityLabel={label}
            testID={`tool-call-file-${label}`}
            onPress={() => {
              preloadFileContent(hostId, path);
              router.push({
                pathname: "/file/[hostId]",
                params: {
                  hostId,
                  path,
                  ...(location.line ? { line: String(location.line) } : {}),
                },
              });
            }}
            style={({ pressed }) => [
              styles.fileRow,
              pressed ? { opacity: 0.6 } : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.fileName, { color: colors.chatLink }]}
            >
              {label}
            </Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="head"
              style={[styles.filePath, { color: colors.mutedForeground }]}
            >
              {path}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function uniqueLocations(locations: readonly AgentToolCallLocation[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = `${location.path}:${location.line ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ToolCallScreen({
  hostId,
  sessionId,
  toolCallId,
}: {
  hostId: string;
  sessionId: string;
  toolCallId: string;
}) {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const detail = useSessionDetail(hostId, sessionId);
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  const workspaces = useViewedSession(hostId, sessionId).workspaces;
  const root = sessionWorkspacePath(
    detail.observation,
    sessionWorkspace(detail.observation, workspaces),
  );
  const call =
    detail.observation?.toolCalls.find((entry) => entry.id === toolCallId) ??
    null;
  const needsResult = call !== null && call.content === undefined;
  const loaded = useToolCallResult(
    hostId,
    toolCallId,
    needsResult ? `${call.status}:${call.updatedAt}` : null,
  );
  const settled = useTransitionSettled();
  if (!call) return null;
  const locations = host?.scopes.includes("files.read")
    ? uniqueLocations(call.locations)
    : [];
  const input = toolCallInputText(call);
  const output = toolCallOutputTail(toolCallResultSource(call, loaded.data));
  const title = call.title.charAt(0).toUpperCase() + call.title.slice(1);
  const outputText = output?.text ?? null;
  const placeholder = toolCallOutputPlaceholder(needsResult, loaded);
  const placeholderText = {
    loading: "",
    failed: t("tool.outputFailed"),
    none: t("tool.noOutput"),
  }[placeholder];

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerTitle: () => (
            <SessionTitle title={title} subtitle={toolCallSubtitle(call, t)} />
          ),
        }}
      />
      {outputText ? (
        <HeaderButtons
          items={[
            {
              key: "copy",
              icon: { ios: "doc.on.doc", android: "content_copy" },
              label: t("tool.copyOutput"),
              onPress: () => void Clipboard.setStringAsync(outputText),
            },
          ]}
        />
      ) : null}
      <ScrollView
        {...scrollIndicator}
        scrollsChildToFocus={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {settled ? (
          <>
            {locations.length > 0 ? (
              <FilesSection hostId={hostId} locations={locations} root={root} />
            ) : null}
            {input ? (
              <CodeSection
                title={t("tool.input")}
                text={input}
                testID="tool-call-input"
              />
            ) : null}
            {outputText ? (
              <CodeSection
                title={t("tool.output")}
                note={output?.truncated ? t("tool.outputTail") : null}
                text={outputText}
                testID="tool-call-output"
              />
            ) : (
              <Text
                style={[
                  styles.empty,
                  {
                    color:
                      placeholder === "failed"
                        ? colors.destructive
                        : colors.mutedForeground,
                  },
                ]}
              >
                {placeholderText}
              </Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.md,
    gap: space.md,
  },
  section: { gap: space.xs },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 13, fontWeight: "500" },
  note: { fontSize: 12 },
  code: {
    borderRadius: 6,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  codeText: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: CODE_SIZE,
    lineHeight: CODE_LINE_HEIGHT,
  },
  empty: { fontSize: 15 },
  fileRow: { minHeight: 44, justifyContent: "center", gap: 2 },
  fileName: { fontSize: 15 },
  filePath: { fontSize: 12 },
});
