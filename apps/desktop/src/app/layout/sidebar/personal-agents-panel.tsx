import type { InboxItem, PersonalAgentRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog } from "@/components/app";
import { SidebarMenu, TooltipProvider } from "@/components/ui";
import { useInbox } from "@/features/inbox";
import { MemoryOnboarding } from "@/features/memory";
import { personalApi, usePersonalAgents } from "@/features/personal";
import { sessionsAtom } from "@/features/sessions";
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
  const { agents } = usePersonalAgents();
  const inbox = useInbox();
  const sessions = useAtomValue(sessionsAtom);
  const setEditId = useSetAtom(personalAgentEditIdAtom);
  const [deleting, setDeleting] = useState<PersonalAgentRecord | null>(null);

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
        <section aria-label={t("roster.label")} className="pe-3 pb-3">
          <SidebarMenu className="gap-0.5">
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
        </section>
        <InboxSection
          activeSessionId={activeSessionId}
          items={inbox}
          onOpen={onOpenInboxItem}
        />
      </SidebarScrollArea>
      <MemoryOnboarding />
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
