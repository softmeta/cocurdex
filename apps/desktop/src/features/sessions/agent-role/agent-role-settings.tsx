import type { AgentRoleRecord } from "@cocurdex/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog, SettingsGroup } from "@/components";
import { Button, IconButton, Text } from "@/components/ui";
import { AgentIconLabel } from "../agent-icon";
import { AgentRoleAvatar } from "./agent-role-avatar";
import { AgentRoleEditDialog } from "./agent-role-edit-dialog";
import {
  deleteAgentRoleRecord,
  getAgentRoles,
  subscribeAgentRoles,
} from "./agent-role-store";
import { useAgentRoleSummary } from "./use-agent-role-summary";

export function AgentRoleSettingsPanel() {
  const { t } = useTranslation(["settings", "sessions"]);
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const formatRoleSummary = useAgentRoleSummary();
  const [editingRole, setEditingRole] = useState<AgentRoleRecord | null>(null);
  const [creating, setCreating] = useState(false);
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
    <div className="settings-panel-enter flex flex-col gap-6">
      <SettingsGroup
        action={
          <Button
            onClick={() => setCreating(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="size-3.5" />
            {t("settings:agentRoles.create")}
          </Button>
        }
        description={t("settings:agentRoles.description")}
        title={t("settings:agentRoles.listTitle")}
      >
        {roles.length === 0 ? (
          <div className="flex flex-col gap-0.5 py-3.5">
            <Text weight="medium">{t("settings:agentRoles.empty")}</Text>
            <Text tone="muted">
              {t("settings:agentRoles.emptyDescription")}
            </Text>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {roles.map((role) => (
              <li className="flex items-start gap-3 py-3.5" key={role.id}>
                <AgentRoleAvatar role={role} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Text truncate weight="medium">
                    {role.name}
                  </Text>
                  <Text size="meta" tone="muted" truncate>
                    <AgentIconLabel agentId={role.agentId}>
                      {formatRoleSummary(role)}
                    </AgentIconLabel>
                  </Text>
                  {role.description ? (
                    <Text as="p" className="line-clamp-2" tone="muted">
                      {role.description}
                    </Text>
                  ) : null}
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
      </SettingsGroup>
      <AgentRoleEditDialog
        open={Boolean(editingRole) || creating}
        role={editingRole}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRole(null);
            setCreating(false);
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
