import type { TeamTemplateRecord } from "@cocurdex/shared";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog } from "@/components";
import { Button, EmptyState, IconButton, Text } from "@/components/ui";
import { getAgentRoles, subscribeAgentRoles } from "../agent-role";
import { ScriptRunSettingsSection } from "../script-run";
import { TeamTemplateEditDialog } from "./team-template-edit-dialog";
import {
  deleteTeamTemplateRecord,
  getTeamTemplates,
  subscribeTeamTemplates,
} from "./team-template-store";

export function TeamSettingsPanel() {
  const { t } = useTranslation("settings");
  const templates = useSyncExternalStore(
    subscribeTeamTemplates,
    getTeamTemplates,
  );
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const [editing, setEditing] = useState<TeamTemplateRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<TeamTemplateRecord | null>(null);

  const roleName = (id: string | null) =>
    roles.find((role) => role.id === id)?.name ?? t("teams.inheritRole");

  const handleDelete = async () => {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(null);
    try {
      await deleteTeamTemplateRecord(id);
      toast.success(t("teams.deleted"));
    } catch {
      toast.error(t("teams.deleteFailed"));
    }
  };

  return (
    <div className="settings-panel-enter flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <Text as="p" tone="muted">
          {t("teams.description")}
        </Text>
        <Button
          onClick={() => setCreating(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-3.5" />
          {t("teams.create")}
        </Button>
      </div>
      {templates.length === 0 ? (
        <EmptyState
          description={t("teams.emptyDescription")}
          icon={<Users />}
          title={t("teams.empty")}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {templates.map((template) => (
            <li className="flex items-center gap-4 py-4" key={template.id}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Text truncate weight="medium">
                  {template.name}
                </Text>
                <Text size="meta" tone="muted" truncate>
                  {template.members
                    .map(
                      (member) =>
                        `${member.name} · ${roleName(member.agentRoleId)}`,
                    )
                    .join(", ")}
                </Text>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  aria-label={t("teams.edit")}
                  onClick={() => setEditing(template)}
                  size="sm"
                >
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  aria-label={t("teams.delete")}
                  onClick={() => setToDelete(template)}
                  size="sm"
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ScriptRunSettingsSection />
      <TeamTemplateEditDialog
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
        open={creating || editing !== null}
        template={editing}
      />
      <AppConfirmDialog
        cancelLabel={t("teams.cancel")}
        confirmLabel={t("teams.delete")}
        description={t("teams.deleteDescription", {
          name: toDelete?.name ?? "",
        })}
        onConfirm={() => void handleDelete()}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        open={Boolean(toDelete)}
        title={t("teams.deleteTitle")}
        variant="destructive"
      />
    </div>
  );
}
