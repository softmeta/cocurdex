import { AlarmClock, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { SidebarPanelHeader } from "@/app/layout/sidebar-panel-header";
import {
  SidebarToggleButton,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import {
  AppSelect,
  ResizableSidebar,
  WORKBENCH_SIDEBAR_WIDTH_PX,
} from "@/components";
import { EmptyState, ScrollArea } from "@/components/ui";
import { usePersonalAgents } from "@/features/personal";
import { RoutineForm } from "./routine-form";
import { RoutineList } from "./routine-list";
import { useRoutines } from "./routines-queries";

const MIN_DETAIL_WIDTH_PX = 280;
const ALL_AGENTS = "all";
const NEW_ROUTINE = "new";

export function RoutinesView({
  onOpenSession,
}: {
  onOpenSession(sessionId: string): void;
}) {
  const { t } = useTranslation("personal");
  const { agents } = usePersonalAgents(t("defaultName"));
  const { routines, loaded } = useRoutines();
  const [scope, setScope] = useState(ALL_AGENTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const agentNames = new Map(
    agents.map((agent) => [agent.id, agent.role.name] as const),
  );
  const agentOptions = agents.map((agent) => ({
    value: agent.id,
    label: agent.role.name,
  }));
  const visible =
    scope === ALL_AGENTS
      ? routines
      : routines.filter((routine) => routine.agentId === scope);
  const selected = routines.find((routine) => routine.id === selectedId);
  const defaultAgentId =
    scope === ALL_AGENTS
      ? (agents.find((agent) => agent.isDefault)?.id ?? agents[0]?.id ?? "")
      : scope;

  let detail: ReactNode = null;
  if (selectedId === NEW_ROUTINE && agents.length > 0) {
    detail = (
      <RoutineForm
        agentOptions={agentOptions}
        defaultAgentId={defaultAgentId}
        key={`new:${defaultAgentId}`}
        routine={null}
        onDeleted={() => setSelectedId(null)}
        onOpenSession={onOpenSession}
        onSaved={(routine) => setSelectedId(routine.id)}
      />
    );
  } else if (selected) {
    detail = (
      <RoutineForm
        agentOptions={agentOptions}
        defaultAgentId={selected.agentId}
        key={`${selected.id}:${selected.updatedAt}`}
        routine={selected}
        onDeleted={() => setSelectedId(null)}
        onOpenSession={onOpenSession}
        onSaved={(routine) => setSelectedId(routine.id)}
      />
    );
  } else if (loaded) {
    detail = (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          description={
            routines.length === 0
              ? t("routines.emptyDescription")
              : t("routines.pickDescription")
          }
          icon={<AlarmClock />}
          title={
            routines.length === 0 ? t("routines.empty") : t("routines.pick")
          }
        />
      </div>
    );
  }

  return (
    <section
      aria-label={t("routines.label")}
      className="flex min-h-0 flex-1"
      style={{ minWidth: WORKBENCH_SIDEBAR_WIDTH_PX + MIN_DETAIL_WIDTH_PX }}
    >
      {sidebarCollapsed ? null : (
        <ResizableSidebar
          ariaLabel={t("routines.resize")}
          defaultWidth={WORKBENCH_SIDEBAR_WIDTH_PX}
        >
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 px-2 pb-2">
            <SidebarPanelHeader
              action={
                <TitlebarIconButton
                  aria-label={t("routines.new")}
                  disabled={agents.length === 0}
                  onClick={() => setSelectedId(NEW_ROUTINE)}
                >
                  <Plus className="size-3.5" />
                </TitlebarIconButton>
              }
              collapseLabel={t("routines.collapse")}
              title={t("routines.label")}
              onCollapse={() => setSidebarCollapsed(true)}
            />
            {agents.length > 1 ? (
              <AppSelect
                options={[
                  { value: ALL_AGENTS, label: t("routines.allAgents") },
                  ...agentOptions,
                ]}
                triggerAriaLabel={t("routines.agent")}
                value={scope}
                onValueChange={setScope}
              />
            ) : null}
            <ScrollArea className="min-h-0 flex-1">
              <RoutineList
                agentNames={agents.length > 1 ? agentNames : new Map()}
                routines={visible}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </ScrollArea>
          </div>
        </ResizableSidebar>
      )}
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-editor-canvas"
        style={{ minWidth: MIN_DETAIL_WIDTH_PX }}
      >
        {sidebarCollapsed ? (
          <div className="flex h-8 shrink-0 items-center px-2">
            <SidebarToggleButton
              label={t("routines.expand")}
              open={false}
              onToggle={() => setSidebarCollapsed(false)}
            />
          </div>
        ) : null}
        {detail}
      </div>
    </section>
  );
}
