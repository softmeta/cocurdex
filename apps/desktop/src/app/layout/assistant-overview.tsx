import {
  INBOX_FAILURE_KINDS,
  INBOX_NEEDS_YOU_KINDS,
  type PersonalAgentRecord,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import {
  AlarmClock,
  Brain,
  Briefcase,
  FileText,
  ListTodo,
  NotebookPen,
  Plug,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, EmptyState, Text } from "@/components/ui";
import { fileTreeVisibleAtom } from "@/features/editor";
import { inboxKindLabel, useInbox } from "@/features/inbox";
import { usePersonalAgents, usePersonalWork } from "@/features/personal";
import {
  routineScopeAtom,
  routineSelectionAtom,
  useRoutines,
} from "@/features/routines";
import {
  AgentRoleAvatar,
  activeSessionIdAtom,
  selectSessionAtom,
  sessionsAtom,
  upsertSessionAtom,
} from "@/features/sessions";
import { openSettings } from "@/features/settings";
import { requestDaemon } from "@/lib";
import { OverviewRow, OverviewSection } from "./assistant-overview-sections";
import { AssistantWorkRow } from "./assistant-work-row";
import {
  type RightPanelView,
  rightPanelResolvedActiveViewAtom,
} from "./right-editor-panel-store";
import { sidebarTabAtom, sidebarTabOf } from "./sidebar/sidebar-tab-store";

function AssistantOverviewContent({
  persona,
}: {
  persona: PersonalAgentRecord;
}) {
  const { t, i18n } = useTranslation("personal");
  const { t: te } = useTranslation("editor");
  const sessions = useAtomValue(sessionsAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const upsertSession = useSetAtom(upsertSessionAtom);
  const selectForm = useSetAtom(sidebarTabAtom);
  const showFiles = useSetAtom(fileTreeVisibleAtom);
  const selectView = useSetAtom(rightPanelResolvedActiveViewAtom);
  const selectRoutine = useSetAtom(routineSelectionAtom);
  const selectRoutineScope = useSetAtom(routineScopeAtom);
  const { data: work, error, mutate } = usePersonalWork(persona.id);
  const {
    routines,
    error: routineError,
    revalidate: reloadRoutines,
  } = useRoutines();
  const inbox = useInbox();
  const ownRoutines = routines.filter(
    (routine) => routine.agentId === persona.id,
  );
  const routineIds = new Set(ownRoutines.map((routine) => routine.id));
  const sessionIds = new Set([
    persona.homeSessionId,
    ...(work ?? []).map((item) => item.sessionId),
  ]);
  for (const routine of ownRoutines)
    if (routine.sessionId) sessionIds.add(routine.sessionId);
  const needsYou = inbox.filter(
    (item) =>
      ((item.sessionId !== null && sessionIds.has(item.sessionId)) ||
        (item.routineId !== null && routineIds.has(item.routineId))) &&
      (INBOX_NEEDS_YOU_KINDS.includes(item.kind) ||
        INBOX_FAILURE_KINDS.includes(item.kind)),
  );
  const activeWork = (work ?? []).filter(
    (item) => item.state === "running" || item.state === "idle",
  );
  const results = (work ?? [])
    .filter((item) => item.state !== "running" && item.state !== "idle")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const stateLabels = {
    running: t("overview.running", { defaultValue: "Running" }),
    idle: t("overview.idle", { defaultValue: "Idle" }),
    completed: t("overview.completed", { defaultValue: "Turn completed" }),
    failed: t("overview.failed", { defaultValue: "Failed" }),
    cancelled: t("overview.cancelled", { defaultValue: "Cancelled" }),
    interrupted: t("overview.interrupted", { defaultValue: "Interrupted" }),
    archived: t("overview.archived", { defaultValue: "Archived" }),
  };
  const openSession = async (id: string) => {
    try {
      const session =
        sessions.find((item) => item.id === id) ??
        (await requestDaemon("session.get", { sessionId: id }));
      if (!session)
        throw new Error(
          t("overview.missingSession", {
            defaultValue: "This work session is no longer available.",
          }),
        );
      upsertSession(session);
      selectForm(sidebarTabOf(session));
      selectSession(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  const openRoutine = (id: string | null) => {
    selectRoutineScope(persona.id);
    selectRoutine(id);
    selectView("routines");
  };
  const emptyWork = t("overview.noWork", {
    defaultValue: "Work delegated by this assistant will appear here.",
  });
  const tools: { view: RightPanelView; title: string; icon: ReactNode }[] = [
    {
      view: "memory",
      title: te("actions.showMemory"),
      icon: <Brain className="size-3.5" />,
    },
    {
      view: "notes",
      title: te("actions.showNotes"),
      icon: <NotebookPen className="size-3.5" />,
    },
    {
      view: "issues",
      title: te("actions.showIssues"),
      icon: <ListTodo className="size-3.5" />,
    },
    {
      view: "editor",
      title: te("actions.conversationFiles"),
      icon: <FileText className="size-3.5" />,
    },
  ];
  return (
    <section
      aria-label={te("actions.showAssistantOverview", {
        defaultValue: "Assistant overview",
      })}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 items-center gap-3 px-5 py-4">
        <AgentRoleAvatar role={persona.role} showAgent={false} size="lg" />
        <div className="min-w-0 flex-1">
          <Text className="truncate" weight="medium">
            {persona.role.name}
          </Text>
          <Text className="line-clamp-2" size="meta" tone="muted">
            {persona.role.description ||
              t("overview.description", {
                defaultValue:
                  "Coordinate work, keep context, and follow through.",
              })}
          </Text>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
        <div className="flex flex-col gap-5">
          {needsYou.length > 0 ? (
            <OverviewSection
              title={t("overview.needsYou", { defaultValue: "Needs you" })}
            >
              {needsYou.map((item) => (
                <OverviewRow
                  key={item.id}
                  title={item.title}
                  detail={inboxKindLabel(t, item.kind)}
                  icon={
                    <span className="size-1.5 shrink-0 rounded-full bg-chat-status-pending-fg" />
                  }
                  onClick={() =>
                    item.sessionId
                      ? openSession(item.sessionId)
                      : openRoutine(item.routineId)
                  }
                />
              ))}
            </OverviewSection>
          ) : null}
          <OverviewSection
            title={t("overview.work", { defaultValue: "Delegated work" })}
          >
            {error ? (
              <Button variant="ghost" onClick={() => void mutate()}>
                <RefreshCw className="size-3.5" />
                {t("overview.retryWork", {
                  defaultValue: "Work could not load. Retry",
                })}
              </Button>
            ) : null}
            {!error && work !== undefined && activeWork.length === 0 ? (
              <Text className="px-2 py-3" size="meta" tone="muted">
                {emptyWork}
              </Text>
            ) : null}
            {activeWork.map((item) => (
              <AssistantWorkRow
                item={item}
                key={item.sessionId}
                stateLabel={stateLabels[item.state]}
                onOpenLocal={(id) => void openSession(id)}
              />
            ))}
          </OverviewSection>
          {results.length > 0 ? (
            <OverviewSection
              title={t("overview.results", { defaultValue: "Recent results" })}
            >
              {results.map((item) => (
                <AssistantWorkRow
                  item={item}
                  key={item.sessionId}
                  stateLabel={stateLabels[item.state]}
                  onOpenLocal={(id) => void openSession(id)}
                />
              ))}
            </OverviewSection>
          ) : null}
          <OverviewSection title={t("routines.label")}>
            <Text className="px-2 pt-2" size="meta" tone="muted">
              {t("overview.host", {
                defaultValue:
                  "Runs on the connected host while its background service is online.",
              })}
            </Text>
            {routineError ? (
              <Button variant="ghost" onClick={() => void reloadRoutines()}>
                <RefreshCw className="size-3.5" />
                {t("overview.retryRoutines", {
                  defaultValue: "Routines could not load. Retry",
                })}
              </Button>
            ) : null}
            {ownRoutines.map((routine) => {
              let detail: string = t("overview.unscheduled", {
                defaultValue: "No next run scheduled",
              });
              if (routine.pausedReason)
                detail =
                  routine.pausedReason === "failures"
                    ? t("overview.pausedFailures", {
                        defaultValue: "Paused after failures",
                      })
                    : t("overview.paused", { defaultValue: "Paused" });
              else if (routine.nextRunAt)
                detail = `${new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short", timeZone: routine.timeZone }).format(new Date(routine.nextRunAt))} · ${routine.timeZone}`;
              return (
                <OverviewRow
                  key={routine.id}
                  routineId={routine.id}
                  title={routine.name}
                  detail={detail}
                  icon={<AlarmClock className="size-3.5 shrink-0" />}
                  onClick={() => openRoutine(routine.id)}
                />
              );
            })}
            <OverviewRow
              title={t("overview.manageRoutines", {
                defaultValue: "Manage this assistant’s routines",
              })}
              icon={<AlarmClock className="size-3.5" />}
              onClick={() => openRoutine(null)}
            />
          </OverviewSection>
          <OverviewSection
            title={t("overview.resources", {
              defaultValue: "Context and resources",
            })}
          >
            {tools.map((item) => (
              <OverviewRow
                key={item.view}
                title={item.title}
                icon={item.icon}
                onClick={() => {
                  if (item.view === "editor") showFiles(true);
                  selectView(item.view);
                }}
              />
            ))}
          </OverviewSection>
          <OverviewSection
            title={t("overview.connections", { defaultValue: "Applications" })}
          >
            <OverviewRow
              title={t("overview.manageConnections", {
                defaultValue: "Connect applications",
              })}
              detail={t("overview.connectionsDescription", {
                defaultValue:
                  "Connect accounts, choose assistant access, and inspect available tools.",
              })}
              icon={<Plug className="size-3.5" />}
              onClick={() => openSettings("apps")}
            />
          </OverviewSection>
        </div>
      </div>
    </section>
  );
}

export function AssistantOverview() {
  const { t } = useTranslation("personal");
  const sessionId = useAtomValue(activeSessionIdAtom);
  const sessions = useAtomValue(sessionsAtom);
  const session = sessions.find((item) => item.id === sessionId);
  const { agents, loaded, error, revalidate } = usePersonalAgents();
  if (error)
    return (
      <Button variant="ghost" onClick={() => void revalidate()}>
        <RefreshCw className="size-3.5" />
        {t("overview.retryAssistant", {
          defaultValue: "Assistant could not load. Retry",
        })}
      </Button>
    );
  const persona = agents.find(
    (item) =>
      item.homeSessionId === sessionId || item.role.id === session?.agentRoleId,
  );
  if (persona)
    return <AssistantOverviewContent key={persona.id} persona={persona} />;
  if (!loaded) return null;
  return (
    <EmptyState
      icon={<Briefcase />}
      title={t("overview.pickAssistant", {
        defaultValue: "Select an assistant to see its work",
      })}
    />
  );
}
