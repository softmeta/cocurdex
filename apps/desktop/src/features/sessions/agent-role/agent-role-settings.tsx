import type { AgentRoleRecord } from "@cocurdex/shared";
import { Bookmark, Pencil, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog } from "@/components";
import { EmptyState, IconButton, Text } from "@/components/ui";
import { agentLabels } from "../session-store";
import { AgentRoleEditDialog } from "./agent-role-edit-dialog";
import {
  deleteAgentRoleRecord,
  getAgentRoles,
  subscribeAgentRoles,
} from "./agent-role-store";
import { formatAgentRoleRecordSummary } from "./agent-role-summary";

export function AgentRoleSettingsPanel() {
  const { t } = useTranslation(["settings", "sessions"]);
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const [editingRole, setEditingRole] = useState<AgentRoleRecord | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<AgentRoleRecord | null>(
    null,
  );

  const handleDelete = async () => {
    if (!roleToDelete) {
      return;
    }
    const id = roleToDelete.id;
    setRoleToDelete(null);
    try {
      await deleteAgentRoleRecord(id);
      toast.success(t("settings:agentRoles.deleted"));
    } catch {
      toast.error(t("settings:agentRoles.deleteFailed"));
    }
  };

  return (
    <div className="settings-panel-enter flex flex-col gap-4">
      <Text as="p" tone="muted">
        {t("settings:agentRoles.description")}
      </Text>
      {roles.length === 0 ? (
        <EmptyState
          description={t("settings:agentRoles.emptyDescription")}
          icon={<Bookmark />}
          title={t("settings:agentRoles.empty")}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {roles.map((role) => (
            <li key={role.id} className="flex items-center gap-4 py-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Text truncate weight="medium">
                  {role.name}
                </Text>
                <Text size="meta" tone="muted" truncate>
                  {formatAgentRoleRecordSummary(role, {
                    agentLabel: agentLabels[role.agentId],
                    permissionLabel: role.permissionMode
                      ? t(`sessions:permissionMode.${role.permissionMode}`)
                      : null,
                    thinkingLabelFor: (level) =>
                      t(`sessions:composer.thinkingLevels.${level}`),
                    fastModeOn: t("sessions:modelMenu.fastModeOn"),
                  })}
                </Text>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  aria-label={t("settings:agentRoles.edit")}
                  size="sm"
                  onClick={() => setEditingRole(role)}
                >
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  aria-label={t("settings:agentRoles.delete")}
                  size="sm"
                  onClick={() => setRoleToDelete(role)}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AgentRoleEditDialog
        open={Boolean(editingRole)}
        role={editingRole}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRole(null);
          }
        }}
      />
      <AppConfirmDialog
        cancelLabel={t("settings:agentRoles.cancel")}
        confirmLabel={t("settings:agentRoles.delete")}
        description={t("settings:agentRoles.deleteDescription", {
          name: roleToDelete?.name ?? "",
        })}
        open={Boolean(roleToDelete)}
        title={t("settings:agentRoles.deleteTitle")}
        variant="destructive"
        onConfirm={() => void handleDelete()}
        onOpenChange={(open) => {
          if (!open) {
            setRoleToDelete(null);
          }
        }}
      />
    </div>
  );
}
