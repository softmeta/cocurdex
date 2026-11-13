import { useSetAtom } from "jotai";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { personalApi } from "@/features/personal";
import { openSettings } from "@/features/settings";
import { personalAgentDraftAtom } from "./sidebar/personal-agent-edit-store";

export function useCreatePersonalAgent() {
  const { t } = useTranslation("personal");
  const setDraft = useSetAtom(personalAgentDraftAtom);
  const running = useRef(false);

  return async () => {
    if (running.current) return;
    running.current = true;
    try {
      const draft = await personalApi.draft();
      if (draft.modelAvailable) {
        setDraft(draft);
        return;
      }
      toast.info(t("create.needsModel"));
      openSettings("providers");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      running.current = false;
    }
  };
}
