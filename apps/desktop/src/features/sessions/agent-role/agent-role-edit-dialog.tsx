import type { AgentRoleRecord, SaveAgentRolePayload } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { agentsAtom } from "../session-store";
import { blankRoleDraft } from "./agent-role-draft";
import { AgentRoleForm } from "./agent-role-form";

export function AgentRoleEditDialog({
  role,
  agentLocked,
  children,
  open,
  onOpenChange,
  onSaved,
  save,
  title,
}: {
  role?: AgentRoleRecord | null;
  agentLocked?: boolean;
  children?: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved?(role: AgentRoleRecord): void;
  save?(payload: SaveAgentRolePayload): Promise<AgentRoleRecord>;
  title?: string;
}) {
  const { t } = useTranslation("settings");
  const agents = useAtomValue(agentsAtom);
  if (!role && !open) {
    return null;
  }

  return (
    <Dialog disablePointerDismissal open={open} onOpenChange={onOpenChange}>
      <DialogContent size="compact">
        <DialogHeader>
          <DialogTitle>
            {title ??
              (role ? t("agentRoles.editTitle") : t("agentRoles.createTitle"))}
          </DialogTitle>
        </DialogHeader>
        <AgentRoleForm
          key={role?.id ?? "new"}
          role={role ?? blankRoleDraft(agents)}
          agentLocked={agentLocked}
          save={save}
          onCancel={() => onOpenChange(false)}
          onSaved={(saved) => {
            onSaved?.(saved);
            onOpenChange(false);
          }}
        >
          {children}
        </AgentRoleForm>
      </DialogContent>
    </Dialog>
  );
}
