import type { AgentId, SessionRecord } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { desktopApi } from "@/lib";
import { selectSessionAtom, upsertSessionAtom } from "../session-store";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useForkSession() {
  const { t } = useTranslation("sessions");
  const upsertSession = useSetAtom(upsertSessionAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  return async (
    session: Pick<SessionRecord, "id" | "title">,
    throughMessageId?: string,
  ) => {
    try {
      const fork = await desktopApi.forkSession({
        sessionId: session.id,
        throughMessageId,
        title: t("lineage.forkTitle", { title: session.title }),
      });
      upsertSession(fork);
      selectSession(fork.id);
    } catch (error) {
      toast.error(t("lineage.forkFailed"), {
        description: errorMessage(error),
      });
    }
  };
}

export function useSwitchSessionAgent() {
  const { t } = useTranslation("sessions");
  const upsertSession = useSetAtom(upsertSessionAtom);
  return async (sessionId: string, agentType: AgentId) => {
    try {
      upsertSession(await desktopApi.switchSessionAgent(sessionId, agentType));
    } catch (error) {
      toast.error(t("lineage.switchAgentFailed"), {
        description: errorMessage(error),
      });
    }
  };
}
