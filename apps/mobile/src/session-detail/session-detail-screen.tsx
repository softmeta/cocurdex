import type { SavedHost } from "@cocurdex/client-runtime";
import type {
  AgentPlanApprovalOutcome,
  ImageAttachment,
  SessionObservationSnapshot,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { randomUUID } from "expo-crypto";
import { Stack, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hostConnection } from "@/connection";
import { SessionConfigChips } from "@/session-config";
import { useViewedSession } from "@/sessions";
import { layout, space, useThemeColors } from "@/theme";
import { useTransitionSettled } from "@/ui";
import { Composer } from "./composer";
import { pickImages, uploadImage } from "./image-attachments";
import { type InteractionActions, InteractionDock } from "./interaction-dock";
import {
  type PendingSend,
  pendingSendItem,
  unconfirmedSends,
} from "./pending-send";
import { PromptOutline } from "./prompt-outline";
import { useSessionDetail } from "./session-detail-stores";
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
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const headerHeight = useHeaderHeight();
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
  const items = useMemo(
    () =>
      condenseTranscript(
        [
          ...(observation
            ? buildTranscript({ ...observation, workspacePath })
            : []),
          ...unconfirmed.map(pendingSendItem),
        ],
        observation?.toolCalls ?? [],
        running || unconfirmed.length > 0,
        runStartedAt,
      ),
    [observation, workspacePath, running, unconfirmed, runStartedAt],
  );
  const pending = observation
    ? pendingInteraction(observation.interactions)
    : null;
  const connection = hostConnection(host.hostId);
  const canInteract = host.scopes.includes("interact");
  const canApprove = host.scopes.includes("approvals");
  const canFork = host.scopes.includes("execute");
  const canReadFiles = host.scopes.includes("files.read");
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

  const title = observation?.session.title ?? listed?.title ?? "";
  const status = failed ? t("detail.failed") : null;

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLargeTitle: false,
          headerTitle: () => (
            <SessionTitle
              title={title}
              subtitle={sessionSubtitle(observation, workspace)}
            />
          ),
        }}
      />
      <PromptOutline
        items={items}
        onJump={(id) => transcript.current?.jumpToItem(id)}
      />
      <KeyboardAvoidingView
        style={[styles.fill, { backgroundColor: colors.background }]}
        behavior="padding"
        keyboardVerticalOffset={headerHeight - bottomInset}
      >
        {detail.loaded && detail.missing ? (
          <View style={styles.center}>
            <Text style={{ color: colors.mutedForeground }}>
              {t("detail.missing")}
            </Text>
          </View>
        ) : !settled ? (
          <View style={styles.fill} />
        ) : (
          <TranscriptView
            ref={transcript}
            sentMessageId={sends.at(-1)?.id}
            items={items}
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
        )}
        {actionFailed ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: colors.destructive }]}
          >
            {t("detail.actionFailed")}
          </Text>
        ) : null}
        <View style={{ paddingBottom: bottomInset }}>
          {pending ? (
            <InteractionDock
              pending={pending}
              canApprove={canApprove}
              actions={actions}
            />
          ) : (
            <Composer
              running={running}
              canSend={canInteract && detail.loaded && !detail.missing}
              onSend={send}
              onStop={stop}
              onPickImages={pickImages}
              onUploadImage={(image) => uploadImage(host.hostId, image)}
              accessory={
                <SessionConfigChips host={host} sessionId={sessionId} />
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    fontSize: 13,
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.xs,
  },
});
