import type { SavedHost } from "@cocurdex/client-runtime";
import type {
  AgentPlanApprovalOutcome,
  SessionObservationSnapshot,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { randomUUID } from "expo-crypto";
import { Stack } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hostConnection } from "@/connection";
import { useViewedSession } from "@/sessions";
import { layout, space, useThemeColors } from "@/theme";
import { Composer } from "./composer";
import { type InteractionActions, InteractionDock } from "./interaction-dock";
import { createSessionDetailStore } from "./session-detail-store";
import { SessionTitle } from "./session-title";
import { buildTranscript, pendingInteraction } from "./transcript";
import { TranscriptView } from "./transcript-view";

function useSessionDetail(hostId: string, sessionId: string) {
  const [store] = useState(() =>
    createSessionDetailStore(hostConnection(hostId), sessionId),
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

function sessionWorkspace(
  observation: SessionObservationSnapshot | null,
  workspaces: readonly WorkspaceRecord[],
) {
  const workspaceId = observation?.session.workspaceId;
  return workspaces.find((entry) => entry.id === workspaceId) ?? null;
}

function sessionSubtitle(
  observation: SessionObservationSnapshot | null,
  workspace: WorkspaceRecord | null,
) {
  const model = observation?.session.providerSnapshot?.modelName;
  const parts = [workspace?.name, model].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function StatusLine({ text, failed }: { text: string; failed: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={styles.statusLine}>
      {failed ? null : (
        <View style={[styles.ring, { borderColor: colors.brandMark }]} />
      )}
      <Text
        style={[
          styles.statusText,
          { color: failed ? colors.destructive : colors.mutedForeground },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function SessionDetailScreen({
  host,
  sessionId,
}: {
  host: SavedHost;
  sessionId: string;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const headerHeight = useHeaderHeight();
  const bottomInset = Math.max(useSafeAreaInsets().bottom - space.sm, 0);
  const detail = useSessionDetail(host.hostId, sessionId);
  const [actionFailed, setActionFailed] = useState(false);
  const observation = detail.observation;
  const workspaces = useViewedSession(host.hostId, sessionId).workspaces;
  const workspace = sessionWorkspace(observation, workspaces);
  const workspacePath =
    observation?.session.worktreePath ?? workspace?.rootPaths[0] ?? null;
  const items = useMemo(
    () =>
      observation ? buildTranscript({ ...observation, workspacePath }) : [],
    [observation, workspacePath],
  );
  const pending = observation
    ? pendingInteraction(observation.interactions)
    : null;
  const connection = hostConnection(host.hostId);
  const canInteract = host.scopes.includes("interact");
  const canApprove = host.scopes.includes("approvals");
  const running =
    observation?.session.status === "running" ||
    observation?.activeRun?.status === "running";
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

  const send = (content: string) => {
    const messageId = randomUUID();
    return attempt(() =>
      connection.command(
        "session.send",
        { sessionId, messageId, content },
        { idempotencyKey: messageId },
      ),
    );
  };

  const stop = () => {
    void attempt(() => connection.request("session.stop", { sessionId }));
  };

  const title = observation?.session.title ?? "";
  const status = failed
    ? t("detail.failed")
    : running
      ? t("detail.working")
      : null;

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
      <KeyboardAvoidingView
        style={[styles.fill, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={headerHeight - bottomInset}
      >
        {detail.loaded && detail.missing ? (
          <View style={styles.center}>
            <Text style={{ color: colors.mutedForeground }}>
              {t("detail.missing")}
            </Text>
          </View>
        ) : (
          <TranscriptView
            items={items}
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
  statusLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ring: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.75 },
  statusText: { fontSize: 14 },
  error: {
    fontSize: 13,
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.xs,
  },
});
