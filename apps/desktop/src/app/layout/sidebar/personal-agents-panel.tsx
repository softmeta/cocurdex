import type { InboxItem, PersonalAgentRecord } from "@cocurdex/shared";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog } from "@/components/app";
import { SidebarMenu, TooltipProvider } from "@/components/ui";
import { useInbox } from "@/features/inbox";
import { MemoryOnboarding } from "@/features/memory";
import { personalApi, usePersonalAgents } from "@/features/personal";
import { sessionsAtom } from "@/features/sessions";
import { AgentRoleEditDialog } from "@/features/sessions/agent-role";
import { InboxSection } from "./inbox-section";
import { personalAgentEditIdAtom } from "./personal-agent-edit-store";
import {
  PersonalAgentRow,
  type PersonalAgentRowActions,
} from "./personal-agent-row";
import { SidebarScrollArea } from "./sidebar-scroll-area";

function notifyFailure(error: unknown) {
  toast.error(error instanceof Error ? error.message : String(error));
}

export function PersonalAgentsPanel({
  activeSessionId,
  onOpenInboxItem,
  onSelectSession,
}: {
  activeSessionId: string | null;
  onOpenInboxItem(item: InboxItem): void;
  onSelectSession(sessionId: string): void;
}) {
  const { t } = useTranslation("personal");
  const { agents } = usePersonalAgents(t("defaultName"));
  const inbox = useInbox();
  const sessions = useAtomValue(sessionsAtom);
  const [editId, setEditId] = useAtom(personalAgentEditIdAtom);
  const [deleting, setDeleting] = useState<PersonalAgentRecord | null>(null);
  const editing = agents.find((agent) => agent.id === editId) ?? null;

  const actions: PersonalAgentRowActions = {
    onSelect: (agent) => onSelectSession(agent.homeSessionId),
    onEdit: (agent) => setEditId(agent.id),
    onTogglePin: (agent) => {
      personalApi
        .update({ id: agent.id, pinned: agent.pinnedAt === null })
        .catch(notifyFailure);
    },
    onToggleMute: (agent) => {
      personalApi
        .update({ id: agent.id, muted: agent.mutedAt === null })
        .catch(notifyFailure);
    },
    onDuplicate: (agent) => {
      personalApi
        .duplicate({
          id: agent.id,
          name: t("copyName", { name: agent.role.name }),
        })
        .then((copy) => onSelectSession(copy.homeSessionId))
        .catch(notifyFailure);
    },
    onDelete: setDeleting,
  };

  return (
    <TooltipProvider closeDelay={80}>
      <SidebarScrollArea
        className="min-h-0 flex-1"
        viewportProps={{
          className: "overflow-x-hidden [&>div]:!block [&>div]:min-w-0",
        }}
      >
        <InboxSection
          activeSessionId={activeSessionId}
          items={inbox}
          onOpen={onOpenInboxItem}
        />
        <SidebarMenu aria-label={t("roster.label")} className="gap-0.5 pe-3">
          {agents.map((agent) => (
            <li className="list-none" key={agent.id}>
              <PersonalAgentRow
                actions={actions}
                agent={agent}
                homeSession={sessions.find(
                  (session) => session.id === agent.homeSessionId,
                )}
                isActive={agent.homeSessionId === activeSessionId}
              />
            </li>
          ))}
        </SidebarMenu>
      </SidebarScrollArea>
      <MemoryOnboarding />
      <AgentRoleEditDialog
        onOpenChange={(open) => {
          if (!open) setEditId(null);
        }}
        open={editing !== null}
        role={editing?.role ?? null}
        save={personalApi.saveRole}
        title={t("edit.title")}
      />
      <AppConfirmDialog
        cancelLabel={t("delete.cancel")}
        confirmLabel={t("delete.confirm")}
        description={t("delete.description")}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) personalApi.remove(target.id).catch(notifyFailure);
        }}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        open={deleting !== null}
        title={t("delete.title", { name: deleting?.role.name ?? "" })}
        variant="destructive"
      />
    </TooltipProvider>
  );
}
