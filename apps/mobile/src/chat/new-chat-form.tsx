import type { SavedHost } from "@cocurdex/client-runtime";
import {
  type AgentProviderSnapshot,
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
import { Keyboard, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hostConnection } from "@/connection";
import { createConversationStarter } from "@/new-session";
import { ConfigTrigger } from "@/session-config";
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
import {
  keyboardHidden,
  ListNotice,
  useBottomKeyboardOverlap,
  useOptionSheet,
} from "@/ui";
import { useChatModels } from "./chat-models";

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
  const keyboardOverlap = useBottomKeyboardOverlap();
  const models = useChatModels(host.hostId);
  const open = useOptionSheet();
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
  const preferred = picked ?? recent;
  const selected =
    models.data?.find(
      ({ provider, model }) =>
        preferred?.providerId === provider.id &&
        preferred.modelId === model.modelId,
    ) ?? models.data?.[0];
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

  const start = async (prompt: string, images: ImageAttachment[]) => {
    if (!canStart || !selected) return false;
    setFailed(false);
    setPreview({ id: "draft", text: prompt, images });
    try {
      const { session, messageId } = await startChat({
        payload: createProviderSnapshotForModel(selected),
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

  const openModels = async () => {
    Keyboard.dismiss();
    await keyboardHidden();
    open({
      title: t("newSession.model"),
      items: (models.data ?? []).map(({ provider, model }) => ({
        key: `${provider.id}/${model.modelId}`,
        label: model.name,
        supporting: provider.name,
        selected:
          selected?.provider.id === provider.id &&
          selected.model.modelId === model.modelId,
        onPress: () =>
          setPicked({ providerId: provider.id, modelId: model.modelId }),
      })),
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: t("chat.new") }} />
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.fill}>
          {preview ? <PendingTranscript host={host} send={preview} /> : null}
          {models.data?.length === 0 || models.error ? (
            <ListNotice
              icon={{ ios: "bubble.left", android: "chat_bubble" }}
              title={models.error ? t("chat.modelsFailed") : t("chat.noModels")}
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
        {failed ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: colors.destructive }]}
          >
            {t("newSession.failed")}
          </Text>
        ) : null}
        <View style={{ paddingBottom: keyboardOverlap || bottomInset }}>
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
              selected ? (
                <ConfigTrigger
                  testID="new-chat-model"
                  summary={selected.model.name}
                  mode={null}
                  onPress={() => void openModels()}
                />
              ) : undefined
            }
          />
        </View>
      </View>
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
