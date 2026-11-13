import {
  getChatThinkingLevelOptions,
  isUnknownDaemonMethodError,
  NEW_CHAT_THINKING_LEVEL,
  resolveChatThinkingLevel,
  type SavedHost,
} from "@cocurdex/client-runtime";
import {
  type AgentProviderSnapshot,
  type AgentThinkingLevel,
  CHAT_AGENT_ID,
  CHAT_WORKSPACE_ID,
  createProviderSnapshotForModel,
  type ImageAttachment,
  isChatSession,
  type SessionRecord,
} from "@cocurdex/shared";
import { Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hostConnection } from "@/connection";
import { createConversationStarter } from "@/new-session";
import { ChatRuntimeControls, useChatModels } from "@/session-config";
import {
  Composer,
  type PendingSend,
  PendingTranscript,
  pickImages,
  SessionDetailScreen,
  uploadImage,
} from "@/session-detail";
import { useHostSessions } from "@/sessions";
import { layout, space, useThemeColors } from "@/theme";
import { KeyboardDock, ListNotice, useKeyboardFollow } from "@/ui";

export function NewChatForm({ host }: { host: SavedHost }) {
  const [started, setStarted] = useState<{
    sessionId: string;
    send: PendingSend;
  } | null>(null);
  return started ? (
    <SessionDetailScreen
      host={host}
      sessionId={started.sessionId}
      pendingSend={started.send}
      entered
    />
  ) : (
    <ChatDraft host={host} onStarted={setStarted} />
  );
}

function ChatDraft({
  host,
  onStarted,
}: {
  host: SavedHost;
  onStarted(started: { sessionId: string; send: PendingSend }): void;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const bottomInset = Math.max(useSafeAreaInsets().bottom - space.sm, 0);
  const keyboard = useKeyboardFollow(bottomInset);
  const models = useChatModels(host.hostId);
  const { sessions } = useHostSessions(host.hostId);
  const recent = sessions.reduce<SessionRecord | undefined>(
    (latest, session) =>
      isChatSession(session) &&
      session.providerSnapshot &&
      (!latest || session.updatedAt > latest.updatedAt)
        ? session
        : latest,
    undefined,
  )?.providerSnapshot;
  const [picked, setPicked] = useState<{
    providerId: string;
    modelId: string;
  } | null>(null);
  const [pickedThinkingLevel, setPickedThinkingLevel] =
    useState<AgentThinkingLevel | null>(null);
  const preferred = picked ?? recent;
  const selected =
    models.data?.find(
      ({ provider, model }) =>
        preferred?.providerId === provider.id &&
        preferred.modelId === model.modelId,
    ) ?? models.data?.[0];
  const snapshot = selected ? createProviderSnapshotForModel(selected) : null;
  const thinkingLevel = resolveChatThinkingLevel(
    getChatThinkingLevelOptions(snapshot),
    pickedThinkingLevel ?? recent?.thinkingLevel,
    NEW_CHAT_THINKING_LEVEL,
  );
  const [startChat] = useState(() => {
    const connection = hostConnection(host.hostId);
    const sessionId = crypto.randomUUID();
    return createConversationStarter(
      connection,
      (providerSnapshot: AgentProviderSnapshot, title) =>
        connection.request("session.configure", {
          id: sessionId,
          workspaceId: CHAT_WORKSPACE_ID,
          sessionKind: "chat",
          agentType: CHAT_AGENT_ID,
          providerSnapshot,
          title,
          writeMode: "read-only",
          sessionModeId: null,
          worktreePath: null,
          peerInbound: "refuse",
        }),
    );
  });
  const [preview, setPreview] = useState<PendingSend | null>(null);
  const [failed, setFailed] = useState(false);
  const canStart =
    !preview && Boolean(selected) && host.scopes.includes("execute");
  const hasModels = Boolean(models.data?.length);
  const unavailable =
    !hasModels && (Boolean(models.error) || models.data !== undefined);

  const start = async (prompt: string, images: ImageAttachment[]) => {
    if (!canStart || !snapshot) return false;
    setFailed(false);
    setPreview({ id: "draft", text: prompt, images });
    try {
      const { session, messageId } = await startChat({
        payload: { ...snapshot, thinkingLevel },
        prompt,
        attachments: images,
        fallbackTitle: t("chat.new"),
      });
      onStarted({
        sessionId: session.id,
        send: { id: messageId, text: prompt, images },
      });
      return true;
    } catch {
      setPreview(null);
      setFailed(true);
      return false;
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t("chat.new") }} />
      <KeyboardDock
        follow={keyboard}
        style={{ backgroundColor: colors.background }}
        dock={
          hasModels ? (
            <>
              {failed ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.error, { color: colors.destructive }]}
                >
                  {t("newSession.failed")}
                </Text>
              ) : null}
              <Composer
                running={false}
                canSend={canStart}
                canEdit={!preview}
                onSend={start}
                onStop={() => undefined}
                onPickImages={pickImages}
                onUploadImage={(image) => uploadImage(host.hostId, image)}
                placeholder={t("chat.prompt")}
                inputTestID="new-chat-prompt"
                autoFocus
                accessory={
                  <ChatRuntimeControls
                    testIDPrefix="new-chat"
                    models={models.data ?? []}
                    selected={selected ?? null}
                    snapshot={snapshot}
                    thinkingLevel={thinkingLevel}
                    onModel={({ provider, model }) =>
                      setPicked({
                        providerId: provider.id,
                        modelId: model.modelId,
                      })
                    }
                    onThinkingLevel={setPickedThinkingLevel}
                  />
                }
              />
            </>
          ) : null
        }
      >
        <View style={styles.fill}>
          {preview ? <PendingTranscript host={host} send={preview} /> : null}
          {unavailable ? (
            <ListNotice
              icon={{ ios: "bubble.left", android: "chat_bubble" }}
              title={models.error ? t("chat.modelsFailed") : t("chat.noModels")}
              description={
                isUnknownDaemonMethodError(models.error)
                  ? t("unavailable.hostOutdated")
                  : undefined
              }
              action={
                models.error
                  ? {
                      label: t("unavailable.retry"),
                      onPress: () => void models.mutate(),
                    }
                  : undefined
              }
            />
          ) : null}
        </View>
      </KeyboardDock>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  error: {
    fontSize: 13,
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.xs,
  },
});
