import {
  type AgentId,
  type AgentRoleRecord,
  supportsAgentTeam,
  type TeamTemplateRecord,
} from "@cocurdex/shared";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { AdapterStatusKind } from "@/features/sessions";
import {
  getStoredTeamTemplateId,
  getTeamTemplates,
  persistTeamTemplateId,
  subscribeTeamTemplates,
} from "@/features/sessions/team";

interface AgentAvailability {
  value: AgentId;
  selectable?: boolean;
  statusKind?: AdapterStatusKind;
}

function resolveTeamLead(
  template: TeamTemplateRecord,
  roles: readonly AgentRoleRecord[],
) {
  const leadRoleId = template.members[0]?.agentRoleId;
  return roles.find((role) => role.id === leadRoleId) ?? null;
}

export function useNewSessionTeam({
  agentOptions,
  roles,
}: {
  agentOptions: readonly AgentAvailability[];
  roles: readonly AgentRoleRecord[];
}) {
  const { t } = useTranslation("sessions");
  const templates = useSyncExternalStore(
    subscribeTeamTemplates,
    getTeamTemplates,
  );
  const [storedTeamId, setStoredTeamId] = useState(getStoredTeamTemplateId);
  const chosenTeamId = templates.some(
    (template) => template.id === storedTeamId,
  )
    ? storedTeamId
    : null;

  const setChosenTeamId = (teamId: string | null) => {
    setStoredTeamId(teamId);
    persistTeamTemplateId(teamId);
  };

  const teamOptions = templates.map((template) => {
    const lead = resolveTeamLead(template, roles);
    const agentId = lead?.agentId;
    const agentOption = agentOptions.find((option) => option.value === agentId);
    return {
      id: template.id,
      agentId,
      avatar: template.avatar,
      name: template.name,
      summary: lead
        ? t("team.summary", {
            count: template.members.length - 1,
            lead: lead.name,
          })
        : t("team.leadMissing"),
      selectable:
        agentId !== undefined &&
        supportsAgentTeam(agentId) &&
        agentOption?.selectable !== false,
      statusKind: agentOption?.statusKind,
    };
  });

  const leadOf = (teamId: string) => {
    const template = templates.find((item) => item.id === teamId);
    return template ? resolveTeamLead(template, roles) : null;
  };

  return { chosenTeamId, setChosenTeamId, teamOptions, templates, leadOf };
}
