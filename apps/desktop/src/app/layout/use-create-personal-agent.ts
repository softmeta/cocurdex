import {
  type MessageAttachment,
  type PersonalAgentRolePayload,
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
import { personalAgentDraftAtom } from "./sidebar/personal-agent-edit-store";

interface FirstMessage {
  text: string;
  attachments: MessageAttachment[];
}

function useAssistantDraft() {
  const { t } = useTranslation("personal");
  return async (): Promise<PersonalAgentRolePayload> => {
    const agents = await personalApi.list();
    const template = agents.find((agent) => agent.isDefault)?.role;
    return {
      ...personalAgentRoleDraft(
        pickPersonaName(
          t("namePool").split(","),
          agents.map((agent) => agent.role.name),
        ),
      ),
      providerId: template?.providerId ?? null,
      modelId: template?.modelId ?? null,
      modelName: template?.modelName ?? null,
    };
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

export function useCreatePersonalAgent() {
  const setDraft = useSetAtom(personalAgentDraftAtom);
  const assistantDraft = useAssistantDraft();
  const singleFlight = useSingleFlight();

  return async () => {
    await singleFlight(async () => setDraft(await assistantDraft()));
  };
}

export function useStartPersonalAgent(
  openSession: (sessionId: string) => void,
) {
  const assistantDraft = useAssistantDraft();
  const singleFlight = useSingleFlight();

  return async ({ text, attachments }: FirstMessage) => {
    const sent = await singleFlight(async () => {
      const created = await personalApi.create({
        role: await assistantDraft(),
      });
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
