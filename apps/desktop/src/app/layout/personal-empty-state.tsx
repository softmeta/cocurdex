import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePersonalAgents } from "@/features/personal";
import { selectSessionAtom } from "@/features/sessions";

function useOpenDefaultAssistant(selectedSessionId: string | null) {
  const { t } = useTranslation("personal");
  const { agents } = usePersonalAgents(t("defaultName"));
  const selectSession = useSetAtom(selectSessionAtom);
  const homeSessionId =
    agents.find((agent) => agent.isDefault)?.homeSessionId ?? null;
  const enabled = !agents.some(
    (agent) => agent.homeSessionId === selectedSessionId,
  );
  useEffect(() => {
    if (enabled && homeSessionId) selectSession(homeSessionId);
  }, [enabled, homeSessionId, selectSession]);
}

export function PersonalEmptyState({
  selectedSessionId,
}: {
  selectedSessionId: string | null;
}) {
  useOpenDefaultAssistant(selectedSessionId);
  return <div className="h-full" />;
}
