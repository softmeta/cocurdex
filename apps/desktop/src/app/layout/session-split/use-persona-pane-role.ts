import { isPersonalSession } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { usePersonaRole } from "@/features/personal";
import { sessionsAtom } from "@/features/sessions";

export function usePersonaPaneRole(sessionId: string | null | undefined) {
  const { t } = useTranslation("personal");
  const sessions = useAtomValue(sessionsAtom);
  const session = sessions.find((item) => item.id === sessionId);
  const roleId =
    session && isPersonalSession(session) ? session.agentRoleId : null;
  return usePersonaRole(roleId ?? null, t("defaultName"));
}
