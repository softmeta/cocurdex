import type { TeamSnapshot } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { hostConnection } from "@/connection";
import { type HeaderButtonItem, useConfirm } from "@/ui";
import { useLeadTeam } from "./team-queries";

function workingMembers(snapshot: TeamSnapshot | null | undefined) {
  if (snapshot?.team.status !== "active") return 0;
  return snapshot.members.filter((member) => member.status !== "stopped")
    .length;
}

/**
 * Stopping a lead's turn leaves its teammates working, so a lead with a working team gets a
 * header action that stops the team.
 */
export function useTeamStopAction(
  hostId: string,
  leadSessionId: string,
  enabled: boolean,
  onFailed: () => void,
) {
  const { t } = useTranslation("sessions");
  const { confirm, dialog } = useConfirm();
  const { data: snapshot } = useLeadTeam(hostId, leadSessionId, enabled);

  const count = workingMembers(snapshot);
  const team = snapshot?.team;
  const action: HeaderButtonItem | null =
    enabled && team && count > 0
      ? {
          key: "stop-team",
          icon: { ios: "person.2.slash", android: "group_off" },
          label: t("team.stop"),
          onPress: () =>
            confirm({
              title: t("team.stopTitle"),
              message: t("team.stopMessage", { count }),
              cancelLabel: t("actions.cancel"),
              confirmLabel: t("team.stopConfirm"),
              destructive: true,
              onConfirm: () =>
                void hostConnection(hostId)
                  .request("team.stop", { teamId: team.id })
                  .catch(onFailed),
            }),
        }
      : null;
  return { action, dialog };
}
