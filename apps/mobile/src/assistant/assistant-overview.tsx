import type { SavedHost } from "@cocurdex/client-runtime";
import {
  type DelegatedWorkRecord,
  INBOX_FAILURE_KINDS,
  INBOX_NEEDS_YOU_KINDS,
  type PersonalAgentRecord,
  type RoutineRecord,
} from "@cocurdex/shared";
import { type Href, Stack, useRouter } from "expo-router";
import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { RoleAvatar } from "@/agents";
import { layout, space, useThemeColors } from "@/theme";
import { Form, FormRow, FormSection, PendingIndicator } from "@/ui";
import {
  useInbox,
  usePersonalAgents,
  usePersonalWork,
  useRoutines,
} from "./assistant-queries";
import { inboxKindLabel } from "./inbox-kind";

type Symbol = { ios: SFSymbol; android: AndroidSymbol };

function RowIcon({ name }: { name: Symbol }) {
  const colors = useThemeColors();
  return (
    <SymbolView name={name} size={18} tintColor={colors.mutedForeground} />
  );
}

function useStateLabel() {
  const { t } = useTranslation("assistant");
  const labels: Record<DelegatedWorkRecord["state"], string> = {
    running: t("overview.state.running"),
    idle: t("overview.state.idle"),
    completed: t("overview.state.completed"),
    failed: t("overview.state.failed"),
    cancelled: t("overview.state.cancelled"),
    interrupted: t("overview.state.interrupted"),
    archived: t("overview.state.archived"),
  };
  return (item: DelegatedWorkRecord) =>
    `${item.workspaceName} · ${labels[item.state]}`;
}

function useRoutineDetail() {
  const { t, i18n } = useTranslation("assistant");
  return (routine: RoutineRecord) => {
    if (routine.pausedReason === "failures") {
      return t("overview.pausedFailures");
    }
    if (routine.pausedReason) return t("overview.paused");
    if (!routine.nextRunAt) return t("overview.unscheduled");
    const next = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: routine.timeZone,
    }).format(new Date(routine.nextRunAt));
    return t("overview.nextRun", { time: next });
  };
}

function isActive(item: DelegatedWorkRecord) {
  return item.state === "running" || item.state === "idle";
}

export function AssistantOverview({
  host,
  agentId,
}: {
  host: SavedHost;
  agentId: string;
}) {
  const agents = usePersonalAgents(host.hostId).data;
  const persona = agents?.find((agent) => agent.id === agentId);
  if (!persona) return <PendingIndicator />;
  return <Overview host={host} persona={persona} />;
}

function Overview({
  host,
  persona,
}: {
  host: SavedHost;
  persona: PersonalAgentRecord;
}) {
  const { t } = useTranslation("assistant");
  const router = useRouter();
  const colors = useThemeColors();
  const work = usePersonalWork(host.hostId, persona.id);
  const routines = useRoutines(host.hostId, persona.id);
  const inbox = useInbox(host.hostId).data ?? [];
  const stateLabel = useStateLabel();
  const routineDetail = useRoutineDetail();
  const items = work.data ?? [];
  const ownRoutines = routines.data ?? [];
  const sessionIds = new Set([
    persona.homeSessionId,
    ...items.map((item) => item.sessionId),
    ...ownRoutines.flatMap((routine) =>
      routine.sessionId ? [routine.sessionId] : [],
    ),
  ]);
  const routineIds = new Set(ownRoutines.map((routine) => routine.id));
  const needsYou = inbox.filter(
    (item) =>
      ((item.sessionId !== null && sessionIds.has(item.sessionId)) ||
        (item.routineId !== null && routineIds.has(item.routineId))) &&
      (INBOX_NEEDS_YOU_KINDS.includes(item.kind) ||
        INBOX_FAILURE_KINDS.includes(item.kind)),
  );
  const activeWork = items.filter(isActive);
  const results = items
    .filter((item) => !isActive(item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  let workFooter: string | undefined;
  if (work.error) workFooter = t("overview.workFailed");
  else if (work.data && activeWork.length === 0) {
    workFooter = t("overview.noWork");
  }

  const openSession = (sessionId: string) =>
    router.push({
      pathname: "/session/[hostId]/[sessionId]",
      params: { hostId: host.hostId, sessionId },
    });
  const openTab = (href: Href) => {
    router.dismissAll();
    router.navigate(href);
  };

  return (
    <>
      <Stack.Screen options={{ title: t("overview.title") }} />
      <Form>
        <View style={styles.header}>
          <RoleAvatar role={persona.role} size={layout.avatarTile} />
          <View style={styles.headerText}>
            <Text
              numberOfLines={1}
              style={[styles.name, { color: colors.foreground }]}
            >
              {persona.role.name}
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.description, { color: colors.mutedForeground }]}
            >
              {persona.role.description || t("overview.description")}
            </Text>
          </View>
        </View>
        {needsYou.length > 0 ? (
          <FormSection title={t("overview.needsYou")}>
            {needsYou.map((item) => (
              <FormRow
                key={item.id}
                testID={`assistant-overview-inbox-${item.id}`}
                supporting={inboxKindLabel(t, item.kind)}
                leading={
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: colors.chatStatusPendingText },
                    ]}
                  />
                }
                onPress={
                  item.sessionId
                    ? () => openSession(item.sessionId as string)
                    : undefined
                }
              >
                {item.title}
              </FormRow>
            ))}
          </FormSection>
        ) : null}
        <FormSection title={t("overview.work")} footer={workFooter}>
          {activeWork.map((item) => (
            <FormRow
              key={item.sessionId}
              testID={`assistant-overview-work-${item.sessionId}`}
              supporting={stateLabel(item)}
              leading={<RowIcon name={WORK_ICON} />}
              onPress={() => openSession(item.sessionId)}
            >
              {item.title}
            </FormRow>
          ))}
        </FormSection>
        {results.length > 0 ? (
          <FormSection title={t("overview.results")}>
            {results.map((item) => (
              <FormRow
                key={item.sessionId}
                supporting={stateLabel(item)}
                leading={<RowIcon name={WORK_ICON} />}
                onPress={() => openSession(item.sessionId)}
              >
                {item.title}
              </FormRow>
            ))}
          </FormSection>
        ) : null}
        <FormSection
          title={t("overview.routines")}
          footer={
            routines.error ? t("overview.routinesFailed") : t("overview.host")
          }
        >
          {ownRoutines.map((routine) => (
            <FormRow
              key={routine.id}
              testID={`assistant-overview-routine-${routine.id}`}
              supporting={routineDetail(routine)}
              leading={<RowIcon name={ROUTINE_ICON} />}
              onPress={
                routine.sessionId
                  ? () => openSession(routine.sessionId as string)
                  : undefined
              }
            >
              {routine.name}
            </FormRow>
          ))}
        </FormSection>
        <FormSection title={t("overview.resources")}>
          <FormRow
            leading={<RowIcon name={NOTES_ICON} />}
            onPress={() => openTab("/notes")}
          >
            {t("overview.notes")}
          </FormRow>
          <FormRow
            leading={<RowIcon name={ISSUES_ICON} />}
            onPress={() => openTab("/issues")}
          >
            {t("overview.issues")}
          </FormRow>
        </FormSection>
      </Form>
    </>
  );
}

const WORK_ICON: Symbol = { ios: "briefcase", android: "work" };
const ROUTINE_ICON: Symbol = { ios: "alarm", android: "alarm" };
const NOTES_ICON: Symbol = { ios: "note.text", android: "description" };
const ISSUES_ICON: Symbol = { ios: "checklist", android: "checklist" };

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.md,
  },
  headerText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: "600" },
  description: { fontSize: 14, lineHeight: 19 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
