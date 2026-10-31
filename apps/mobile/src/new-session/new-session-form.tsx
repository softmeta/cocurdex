import type { SavedHost } from "@cocurdex/client-runtime";
import type { ImageAttachment } from "@cocurdex/shared";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentIcon, RoleAvatar } from "@/agents";
import { hostConnection } from "@/connection";
import { useSavedHosts } from "@/hosts";
import { ConfigTrigger } from "@/session-config";
import {
  Composer,
  type PendingSend,
  PendingTranscript,
  pickImages,
  SessionDetailScreen,
  SessionTitle,
  uploadImage,
} from "@/session-detail";
import { layout, space, useThemeColors } from "@/theme";
import { keyboardHidden, useBottomKeyboardOverlap } from "@/ui";
import { useNewSessionSelection } from "./new-session-selection";
import { useNewSessionState } from "./new-session-store";
import { createSessionStarter, shownSessionPayload } from "./start-session";

interface StartedSession {
  sessionId: string;
  pendingSend: PendingSend;
}

function Draft({
  host,
  onStarted,
}: {
  host: SavedHost;
  onStarted(started: StartedSession): void;
}) {
  const { t } = useTranslation("sessions");
  const router = useRouter();
  const colors = useThemeColors();
  const bottomInset = Math.max(useSafeAreaInsets().bottom - space.sm, 0);
  const keyboardOverlap = useBottomKeyboardOverlap();
  const {
    draft,
    workspaceId,
    workspace,
    defaults,
    agent,
    role,
    configSummary,
    modeLabel,
  } = useNewSessionSelection(host);
  const [startSession] = useState(() =>
    createSessionStarter(hostConnection(host.hostId)),
  );
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<PendingSend | null>(null);
  const canStart =
    !starting &&
    workspaceId !== null &&
    defaults !== undefined &&
    host.scopes.includes("execute");

  const start = async (prompt: string, attachments: ImageAttachment[]) => {
    if (!canStart || !workspaceId || !defaults) return false;
    setStarting(true);
    setFailed(false);
    setPreview({ id: "draft", text: prompt, images: attachments });
    try {
      const { session, messageId } = await startSession({
        payload: shownSessionPayload(
          workspaceId,
          defaults,
          role?.id ?? null,
          draft.runtime,
        ),
        prompt,
        attachments,
        fallbackTitle: role?.name ?? agent?.label ?? t("newSession.title"),
      });
      onStarted({
        sessionId: session.id,
        pendingSend: { id: messageId, text: prompt, images: attachments },
      });
      return true;
    } catch {
      setPreview(null);
      setStarting(false);
      setFailed(true);
      return false;
    }
  };

  const openConfig = async () => {
    Keyboard.dismiss();
    await keyboardHidden();
    router.push("/new-session/config");
  };

  const leading = role ? (
    <RoleAvatar role={role} agentId={role.agentId} size={16} />
  ) : agent ? (
    <AgentIcon agentId={agent.id} size={14} />
  ) : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          title: t("newSession.title"),
          headerTitle: () => (
            <SessionTitle
              title={t("newSession.title")}
              subtitle={workspace?.workspace.name ?? null}
            />
          ),
        }}
      />
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.fill}>
          {preview ? <PendingTranscript host={host} send={preview} /> : null}
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
            canEdit={!starting}
            onSend={start}
            onStop={() => undefined}
            onPickImages={pickImages}
            onUploadImage={(image) => uploadImage(host, image)}
            placeholder={t("newSession.promptPlaceholder")}
            inputTestID="new-session-prompt"
            autoFocus
            accessory={
              <ConfigTrigger
                testID="new-session-agent"
                leading={leading}
                summary={configSummary || t("newSession.none")}
                mode={modeLabel}
                onPress={() => void openConfig()}
              />
            }
          />
        </View>
      </View>
    </>
  );
}

function NewSessionScreen({ host }: { host: SavedHost }) {
  const [started, setStarted] = useState<StartedSession | null>(null);
  if (started) {
    return (
      <SessionDetailScreen
        host={host}
        sessionId={started.sessionId}
        pendingSend={started.pendingSend}
        entered
      />
    );
  }
  return <Draft host={host} onStarted={setStarted} />;
}

export function NewSessionForm() {
  const { hostId } = useNewSessionState();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  return host ? <NewSessionScreen host={host} /> : null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  error: {
    fontSize: 13,
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.xs,
  },
});
