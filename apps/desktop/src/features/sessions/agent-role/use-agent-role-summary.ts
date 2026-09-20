import type { AgentId, AgentRoleDraft } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useSessionModeLabels } from "../session-mode-label";
import {
  agentLabels,
  agentsAtom,
  getSessionModeOptions,
} from "../session-store";
import { formatAgentRoleRecordSummary } from "./agent-role-summary";

const DEFAULT_SESSION_MODE_ID = "default";

export function useAgentRoleSummary() {
  const { t } = useTranslation(["sessions", "settings"]);
  const agents = useAtomValue(agentsAtom);
  const { label: sessionModeLabel } = useSessionModeLabels();

  const sessionModeLabelFor = (agentId: AgentId, modeId: string) => {
    if (modeId === DEFAULT_SESSION_MODE_ID) {
      return null;
    }
    const mode = getSessionModeOptions(agents, agentId).find(
      (item) => item.id === modeId,
    );
    return mode ? sessionModeLabel(agentId, mode) : null;
  };

  return (role: AgentRoleDraft) =>
    formatAgentRoleRecordSummary(role, {
      agentLabel: agentLabels[role.agentId],
      permissionLabel: role.permissionMode
        ? t(`sessions:permissionMode.${role.permissionMode}`)
        : null,
      sessionModeLabelFor,
      thinkingLabelFor: (level) =>
        t(`sessions:composer.thinkingLevels.${level}`),
      fastModeOn: t("sessions:modelMenu.fastModeOn"),
    });
}
