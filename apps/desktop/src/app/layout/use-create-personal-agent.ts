import {
  type MessageAttachment,
  personalAgentRoleDraft,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  personalApi,
  pickPersonaName,
  revalidatePersonalAgents,
} from "@/features/personal";
import { taskApi } from "@/lib";
import { personalAgentEditIdAtom } from "./sidebar/personal-agent-edit-store";

interface FirstMessage {
  text: string;
  attachments: MessageAttachment[];
}

function useCreateAssistant() {
  const { t } = useTranslation("personal");
  return async () => {
    const agents = await personalApi.list();
    const template = agents.find((agent) => agent.isDefault)?.role;
    return personalApi.create({
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
  };
}

function useSingleFlight() {
  const running = useRef(false);
  return async <T>(task: () => Promise<T>): Promise<T | null> => {
    if (running.current) return null;
    running.current = true;
    try {
      return await task();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      running.current = false;
    }
  };
}

export function useCreatePersonalAgent(
  openSession: (sessionId: string) => void,
) {
  const setEditId = useSetAtom(personalAgentEditIdAtom);
  const createAssistant = useCreateAssistant();
  const singleFlight = useSingleFlight();

  return async () => {
    await singleFlight(async () => {
      const created = await createAssistant();
      setEditId(created.id);
      await revalidatePersonalAgents();
      openSession(created.homeSessionId);
    });
  };
}

export function useStartPersonalAgent(
  openSession: (sessionId: string) => void,
) {
  const createAssistant = useCreateAssistant();
  const singleFlight = useSingleFlight();

  return async ({ text, attachments }: FirstMessage) => {
    const sent = await singleFlight(async () => {
      const created = await createAssistant();
      await taskApi.sendMessage({
        sessionId: created.homeSessionId,
        messageId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      await revalidatePersonalAgents();
      openSession(created.homeSessionId);
      return true;
    });
    return sent ?? false;
  };
}
