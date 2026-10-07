import type { AgentRoleRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
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
  open,
  onOpenChange,
  onSaved,
}: {
  role?: AgentRoleRecord | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved?(role: AgentRoleRecord): void;
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
            {role ? t("agentRoles.editTitle") : t("agentRoles.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <AgentRoleForm
          key={role?.id ?? "new"}
          role={role ?? blankRoleDraft(agents)}
          onCancel={() => onOpenChange(false)}
          onSaved={(saved) => {
            onSaved?.(saved);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
