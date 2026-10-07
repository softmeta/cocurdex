import type {
  AgentRoleRecord,
  TeamTemplateMember,
  TeamTemplateRecord,
} from "@cocurdex/shared";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog, SettingsGroup } from "@/components";
import { Button, IconButton, Text } from "@/components/ui";
import { getAgentRoles, subscribeAgentRoles } from "../agent-role";
import { AgentRoleAvatar } from "../agent-role/agent-role-avatar";
import { ScriptRunSettingsSection } from "../script-run";
import { TeamMemberAvatar } from "./team-member-avatar";
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

  const roleOf = (id: string | null) =>
    roles.find((role) => role.id === id) ?? null;

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
            {t("teams.create")}
          </Button>
        }
        description={t("teams.description")}
        title={t("teams.listTitle")}
      >
        {templates.length === 0 ? (
          <div className="flex items-center gap-1 py-3.5">
            <Text tone="muted">{t("teams.empty")}</Text>
            <Button
              className="px-1"
              onClick={() => setCreating(true)}
              size="sm"
              type="button"
              variant="link"
            >
              {t("teams.createFirst")}
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {templates.map((template) => (
              <li className="flex items-start gap-3 py-3.5" key={template.id}>
                <AgentRoleAvatar
                  placeholder={<Users className="size-4" />}
                  role={template}
                  size="lg"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Text truncate weight="medium">
                    {template.name}
                  </Text>
                  {template.description ? (
                    <Text as="p" className="line-clamp-2" tone="muted">
                      {template.description}
                    </Text>
                  ) : null}
                  <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                    {template.members.map((member) => (
                      <TeamMemberChip
                        inheritLabel={t("teams.inheritRole")}
                        key={member.name}
                        member={member}
                        role={roleOf(member.agentRoleId)}
                      />
                    ))}
                  </ul>
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
      </SettingsGroup>
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

function TeamMemberChip({
  inheritLabel,
  member,
  role,
}: {
  inheritLabel: string;
  member: TeamTemplateMember;
  role: AgentRoleRecord | null;
}) {
  return (
    <li className="flex min-w-0 items-center gap-1.5">
      <TeamMemberAvatar member={member} role={role} />
      <Text size="meta" truncate>
        {member.name}
      </Text>
      <Text size="meta" tone="muted" truncate>
        {role?.name ?? inheritLabel}
      </Text>
    </li>
  );
}
