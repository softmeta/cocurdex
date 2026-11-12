import type { PersonalAgentRecord } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { Bot, Plus } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState } from "@/components/ui";
import { usePersonalAgents } from "@/features/personal";
import { selectSessionAtom } from "@/features/sessions";
import { useCreatePersonalAgent } from "./use-create-personal-agent";

function useOpenFirstAssistant(
  agents: readonly PersonalAgentRecord[],
  selectedSessionId: string | null,
) {
  const selectSession = useSetAtom(selectSessionAtom);
  const homeSessionId =
    (agents.find((agent) => agent.isDefault) ?? agents[0])?.homeSessionId ??
    null;
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
  const { t } = useTranslation("personal");
  const { agents, loaded } = usePersonalAgents();
  const createAssistant = useCreatePersonalAgent();
  useOpenFirstAssistant(agents, selectedSessionId);
  if (!loaded || agents.length > 0) return <div className="h-full" />;
  return (
    <section
      aria-label={t("empty.title")}
      className="flex h-full items-center justify-center px-6"
    >
      <EmptyState
        action={
          <Button onClick={() => void createAssistant()}>
            <Plus />
            {t("roster.new")}
          </Button>
        }
        className="max-w-sm"
        description={t("empty.description")}
        icon={<Bot />}
        title={t("empty.title")}
      />
    </section>
  );
}
