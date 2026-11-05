import { isPersonalSession } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { usePersonaRole } from "@/features/personal";
import { AgentRoleAvatar, sessionsAtom } from "@/features/sessions";

export function PersonaTitleAvatar({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation("personal");
  const sessions = useAtomValue(sessionsAtom);
  const session = sessions.find((item) => item.id === sessionId);
  const roleId =
    session && isPersonalSession(session) ? session.agentRoleId : null;
  const role = usePersonaRole(roleId ?? null, t("defaultName"));
  if (!role) return null;
  return <AgentRoleAvatar role={role} showAgent={false} size="sm" />;
}
