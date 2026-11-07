import { personalAgentRoleDraft } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  personalApi,
  pickPersonaName,
  revalidatePersonalAgents,
} from "@/features/personal";
import { personalAgentEditIdAtom } from "./sidebar/personal-agent-edit-store";

export function useCreatePersonalAgent(
  openSession: (sessionId: string) => void,
) {
  const { t } = useTranslation("personal");
  const setEditId = useSetAtom(personalAgentEditIdAtom);
  const creating = useRef(false);

  return async () => {
    if (creating.current) return;
    creating.current = true;
    try {
      const agents = await personalApi.list();
      const template = agents.find((agent) => agent.isDefault)?.role;
      const created = await personalApi.create({
        role: {
          ...personalAgentRoleDraft(
            pickPersonaName(
              t("namePool").split(","),
              agents.map((agent) => agent.role.name),
            ),
          ),
          providerId: template?.providerId ?? null,
          modelId: template?.modelId ?? null,
          modelName: template?.modelName ?? null,
        },
      });
      setEditId(created.id);
      await revalidatePersonalAgents();
      openSession(created.homeSessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      creating.current = false;
    }
  };
}
