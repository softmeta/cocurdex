import type { SavedHost } from "@cocurdex/client-runtime";
import {
  type AgentPlanApprovalOutcome,
  type ImageAttachment,
  isChatSession,
  type SessionObservationSnapshot,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { randomUUID } from "expo-crypto";
import { Stack, useRouter } from "expo-router";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePersonaBubble } from "@/agents";
import { PersonaIntro, usePersonaOfSession } from "@/assistant";
import { hostConnection } from "@/connection";
import { SessionConfigChips, useNeedsExecuteToDrive } from "@/session-config";
import { useViewedSession } from "@/sessions";
import { layout, space, useThemeColors } from "@/theme";
import {
  type HeaderButtonItem,
  useHeaderOverlap,
  useTransitionSettled,
} from "@/ui";
import { Composer } from "./composer";
import { conversationTranscript } from "./conversation-transcript";
import { pickImages, uploadImage } from "./image-attachments";
import { type InteractionActions, InteractionDock } from "./interaction-dock";
import {
  type PendingSend,
  pendingSendItem,
  unconfirmedSends,
} from "./pending-send";
import { PromptOutline } from "./prompt-outline";
import {
  loadOlderSessionDetail,
  useSessionDetail,
} from "./session-detail-stores";
import { SessionTitle } from "./session-title";
import { sessionWorkspace, sessionWorkspacePath } from "./session-workspace";
import { StatusLine } from "./status-line";
import { buildTranscript, pendingInteraction } from "./transcript";
import { condenseTranscript } from "./transcript-activity";
import { type TranscriptHandle, TranscriptView } from "./transcript-view";

function sessionSubtitle(
  observation: SessionObservationSnapshot | null,
  workspace: WorkspaceRecord | null,
) {
  const model = observation?.session.providerSnapshot?.modelName;
  const parts = [workspace?.name, model].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function runStartTime(observation: SessionObservationSnapshot | null) {
  const run = observation?.activeRun;
  if (run?.status !== "running") return undefined;
  const time = Date.parse(run.startedAt);
  return Number.isNaN(time) ? undefined : time;
}

export function SessionDetailScreen({
  host,
  sessionId,
  entered = false,
  pendingSend,
}: {
  host: SavedHost;
  sessionId: string;
  entered?: boolean;
  pendingSend?: PendingSend;
}) {
  const router = useRouter();
  const { t } = useTranslation(["sessions", "assistant"]);
  const colors = useThemeColors();
  const frame = useHeaderOverlap();
  const bottomInset = Math.max(useSafeAreaInsets().bottom - space.sm, 0);
  const detail = useSessionDetail(host.hostId, sessionId);
  const transcript = useRef<TranscriptHandle>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const transitionSettled = useTransitionSettled();
  const settled = entered || transitionSettled;
  const observation = detail.observation;
  const viewed = useViewedSession(host.hostId, sessionId);
  const workspaces = viewed.workspaces;
  const listed = viewed.sessions.find((entry) => entry.id === sessionId);
  const session = observation?.session ?? listed;
  const chat = session !== undefined && isChatSession(session);
  const persona = usePersonaOfSession(host.hostId, sessionId);
  const personaBubble = usePersonaBubble(persona?.role ?? null);
  const workspace = sessionWorkspace(observation, workspaces);
  const workspacePath = sessionWorkspacePath(observation, workspace);
  const running =
    observation?.session.status === "running" ||
    observation?.activeRun?.status === "running";
  const runStartedAt = runStartTime(observation);
  const [sends, setSends] = useState<readonly PendingSend[]>(() =>
    pendingSend ? [pendingSend] : [],
  );
  const unconfirmed = useMemo(
    () =>
      observation
        ? unconfirmedSends(
            sends,
            observation.messages,
            observation.activeMessages,
          )
        : sends,
    [sends, observation],
  );
  const conversation = persona !== null || chat;
  const items = useMemo(() => {
    const transcriptItems = [
      ...(observation
        ? buildTranscript({ ...observation, workspacePath })
        : []),
      ...unconfirmed.map(pendingSendItem),
    ];
    const busy = running || unconfirmed.length > 0;
    if (conversation) return conversationTranscript(transcriptItems, busy);
    return condenseTranscript(
      transcriptItems,
      observation?.toolCalls ?? [],
      busy,
      runStartedAt,
    );
  }, [
    observation,
    workspacePath,
    running,
    unconfirmed,
    runStartedAt,
    conversation,
  ]);
  const pending = observation
    ? pendingInteraction(observation.interactions)
    : null;
  const connection = hostConnection(host.hostId);
  const canInteract = host.scopes.includes("interact");
  const unattended = useNeedsExecuteToDrive(host, sessionId);
  const needsExecute = !chat && unattended;
  const canApprove = host.scopes.includes("approvals");
  const canFork = !chat && host.scopes.includes("execute");
  const canReadFiles = !chat && host.scopes.includes("files.read");
  const failed = observation?.session.status === "error";

  const attempt = async (run: () => Promise<unknown>) => {
    setActionFailed(false);
    try {
      await run();
      return true;
    } catch {
      setActionFailed(true);
      return false;
    }
  };

  const actions: InteractionActions = {
    resolvePermission: async (requestId, optionId) => {
      await attempt(() =>
        connection.request("permission.resolve", { requestId, optionId }),
      );
    },
    answerQuestion: async (questionId, answer) => {
      await attempt(() =>
        connection.request("question.resolve", { questionId, answer }),
      );
    },
    resolvePlan: (approvalId, outcome: AgentPlanApprovalOutcome) => {
      void attempt(() =>
        connection.request("planApproval.resolve", {
          approvalId,
          decision: { outcome },
        }),
      );
    },
  };

  const send = async (content: string, attachments: ImageAttachment[]) => {
    const messageId = randomUUID();
    const pending: PendingSend = {
      id: messageId,
      text: content,
      images: attachments,
    };
    setSends((current) => [...current, pending]);
    const sent = await attempt(() =>
      connection.command(
        "session.send",
        {
          sessionId,
          messageId,
          content,
          attachments,
          thinkingLevel:
            observation?.session.providerSnapshot?.thinkingLevel ?? undefined,
        },
        { idempotencyKey: messageId },
      ),
    );
    if (!sent) {
      setSends((current) => current.filter((entry) => entry.id !== messageId));
    }
    return sent;
  };

  const fork = (throughMessageId: string) => {
    void attempt(async () => {
      const forked = await connection.request("session.fork", {
        sessionId,
        throughMessageId,
        title: t("message.forkTitle", { title }),
      });
      router.push({
        pathname: "/session/[hostId]/[sessionId]",
        params: { hostId: host.hostId, sessionId: forked.id },
      });
    });
  };

  const stop = () => {
    void attempt(() => connection.request("session.stop", { sessionId }));
  };

  const title =
    persona?.role.name ?? observation?.session.title ?? listed?.title ?? "";
  const showIntro =
    persona !== null &&
    detail.loaded &&
    !running &&
    items.length === 0 &&
    canInteract;
  const status = failed ? t("detail.failed") : null;
  const personaPlaceholder = persona
    ? t("assistant:thread.placeholder", { name: persona.role.name })
    : undefined;

  const headerActions: HeaderButtonItem[] = persona
    ? [
        {
          key: "overview",
          icon: { ios: "square.grid.2x2", android: "dashboard" },
          label: t("assistant:overview.title"),
          onPress: () =>
            router.push({
              pathname: "/assistant-overview/[hostId]/[agentId]",
              params: { hostId: host.hostId, agentId: persona.id },
            }),
        },
      ]
    : [];

  const [dockHeight, setDockHeight] = useState<number | null>(null);
  let body: ReactNode;
  const dockInset = { paddingBottom: dockHeight ?? 0 };
  if (detail.loaded && detail.missing) {
    body = (
      <View style={[styles.center, dockInset]}>
        <Text style={{ color: colors.mutedForeground }}>
          {t("detail.missing")}
        </Text>
      </View>
    );
  } else if (!settled) {
    body = <View style={styles.fill} />;
  } else if (showIntro) {
    body = (
      <View style={[styles.fill, dockInset]}>
        <PersonaIntro onPick={(text) => void send(text, [])} />
      </View>
    );
  } else {
    body = (
      <TranscriptView
        ref={transcript}
        sentMessageId={sends.at(-1)?.id}
        items={items}
        presentation={conversation ? "assistant" : "work"}
        userBubble={personaBubble ?? undefined}
        bottomInset={dockHeight ?? 0}
        onReachOldest={
          observation?.olderBeforeSeq == null
            ? undefined
            : () => void loadOlderSessionDetail(host.hostId, sessionId)
        }
        actions={{
          hostId: host.hostId,
          fileRoot: canReadFiles ? workspacePath : undefined,
          onOpenImage: (attachment) =>
            router.push({
              pathname: "/image/[hostId]",
              params: {
                hostId: host.hostId,
                filePath: attachment.filePath,
                name: attachment.name,
              },
            }),
          onFork: canFork ? fork : null,
          onOpenTool: (toolCallId) =>
            router.push({
              pathname: "/tool-call/[hostId]/[sessionId]/[toolCallId]",
              params: { hostId: host.hostId, sessionId, toolCallId },
            }),
        }}
        footer={
          status ? <StatusLine text={status} failed={failed} /> : undefined
        }
      />
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLargeTitle: false,
          headerTitle: () => (
            <SessionTitle
              title={title}
              subtitle={
                persona
                  ? null
                  : sessionSubtitle(observation, chat ? null : workspace)
              }
            />
          ),
        }}
      />
      <PromptOutline
        items={conversation ? [] : items}
        actions={headerActions}
        onJump={(id) => transcript.current?.jumpToItem(id)}
      />
      <View ref={frame.ref} style={styles.fill} onLayout={frame.onLayout}>
        <KeyboardAvoidingView
          style={[styles.fill, { backgroundColor: colors.background }]}
          behavior="padding"
          keyboardVerticalOffset={frame.windowTop - bottomInset}
        >
          <View style={styles.fill}>
            {dockHeight === null ? null : body}
            <View
              pointerEvents="box-none"
              style={[styles.dock, { paddingBottom: bottomInset }]}
              onLayout={(event) =>
                setDockHeight(event.nativeEvent.layout.height)
              }
            >
              {canInteract && needsExecute ? (
                <Text
                  testID="session-needs-execute"
                  style={[styles.error, { color: colors.mutedForeground }]}
                >
                  {t("detail.needsExecute")}
                </Text>
              ) : null}
              {actionFailed ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.error, { color: colors.destructive }]}
                >
                  {t("detail.actionFailed")}
                </Text>
              ) : null}
              {pending ? (
                <InteractionDock
                  pending={pending}
                  canApprove={canApprove}
                  actions={actions}
                />
              ) : (
                <Composer
                  running={running}
                  canSend={
                    canInteract &&
                    !needsExecute &&
                    detail.loaded &&
                    !detail.missing
                  }
                  placeholder={chat ? t("chat.prompt") : personaPlaceholder}
                  onSend={send}
                  onStop={stop}
                  onPickImages={pickImages}
                  onUploadImage={(image) => uploadImage(host.hostId, image)}
                  accessory={
                    conversation ? undefined : (
                      <SessionConfigChips host={host} sessionId={sessionId} />
                    )
                  }
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    fontSize: 13,
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.xs,
  },
});
