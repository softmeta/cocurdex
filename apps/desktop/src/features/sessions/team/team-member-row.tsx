import {
  type AgentRoleRecord,
  supportsAgentTeam,
  type TeamTemplateMember,
} from "@cocurdex/shared";
import { Crown, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownTriggerLabel, AppSelect } from "@/components";
import { Badge, IconButton, Text, Textarea } from "@/components/ui";
import { AgentRoleAvatar } from "../agent-role/agent-role-avatar";
import { useAgentRoleSummary } from "../agent-role/use-agent-role-summary";
import { TeamMemberAvatar } from "./team-member-avatar";

export const CREATE_ROLE_VALUE = "__create_role__";

export function TeamMemberRow({
  isLead,
  member,
  removable,
  roles,
  takenRoleIds,
  onChange,
  onCreateRole,
  onMakeLead,
  onRemove,
}: {
  isLead: boolean;
  member: TeamTemplateMember;
  removable: boolean;
  roles: readonly AgentRoleRecord[];
  takenRoleIds: ReadonlySet<string>;
  onChange(patch: Partial<TeamTemplateMember>): void;
  onCreateRole(): void;
  onMakeLead(): void;
  onRemove(): void;
}) {
  const { t } = useTranslation("settings");
  const formatRoleSummary = useAgentRoleSummary();
  const role = roles.find((item) => item.id === member.agentRoleId) ?? null;
  const roleOptions = roles
    .filter(
      (item) =>
        supportsAgentTeam(item.agentId) &&
        (item.id === member.agentRoleId || !takenRoleIds.has(item.id)),
    )
    .map((item) => ({
      icon: <AgentRoleAvatar role={item} />,
      value: item.id,
      label: item.name,
      textValue: item.name,
      description: formatRoleSummary(item),
    }));
  const sections = [
    ...(roleOptions.length > 0 ? [{ options: roleOptions }] : []),
    {
      options: [
        {
          icon: <Plus className="size-4" />,
          value: CREATE_ROLE_VALUE,
          label: t("teams.createRole"),
        },
      ],
    },
  ];

  return (
    <li className="flex gap-3 py-3">
      <TeamMemberAvatar className="mt-1" role={role} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <AppSelect
            contentClassName="max-w-80"
            sections={sections}
            triggerAriaLabel={t("teams.role")}
            triggerClassName="min-w-0 max-w-48 shrink-0"
            triggerLabel={
              <MemberRoleLabel
                missing={Boolean(member.agentRoleId) && !role}
                role={role}
              />
            }
            value={member.agentRoleId}
            onValueChange={(value) => {
              if (value === CREATE_ROLE_VALUE) {
                onCreateRole();
                return;
              }
              onChange({ agentRoleId: value });
            }}
          />
          {isLead ? <Badge variant="secondary">{t("teams.lead")}</Badge> : null}
          <Text className="min-w-0 flex-1" size="meta" tone="muted" truncate>
            {role ? formatRoleSummary(role) : null}
          </Text>
          {isLead ? null : (
            <IconButton
              aria-label={t("teams.makeLead")}
              onClick={onMakeLead}
              size="sm"
              title={t("teams.makeLead")}
            >
              <Crown className="size-4" />
            </IconButton>
          )}
          {removable ? (
            <IconButton
              aria-label={t("teams.removeMember")}
              onClick={onRemove}
              size="sm"
            >
              <Trash2 className="size-4" />
            </IconButton>
          ) : null}
        </div>
        <Textarea
          aria-label={t("teams.memberPrompt")}
          className="max-h-40 min-h-12"
          onChange={(event) => onChange({ prompt: event.target.value })}
          placeholder={
            isLead
              ? t("teams.leadPromptPlaceholder")
              : t("teams.memberPromptPlaceholder")
          }
          value={member.prompt}
        />
      </div>
    </li>
  );
}

function MemberRoleLabel({
  missing,
  role,
}: {
  missing: boolean;
  role: AgentRoleRecord | null;
}) {
  const { t } = useTranslation("settings");
  if (role) {
    return <AppDropdownTriggerLabel>{role.name}</AppDropdownTriggerLabel>;
  }
  return (
    <AppDropdownTriggerLabel className="text-muted-foreground">
      {missing ? t("teams.roleMissing") : t("teams.rolePlaceholder")}
    </AppDropdownTriggerLabel>
  );
}
