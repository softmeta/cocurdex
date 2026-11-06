import {
  PERSONAL_AGENT_SOUL_MAX_LENGTH,
  type PersonalAgentRecord,
  type SaveAgentRolePayload,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, FieldLabel, Textarea } from "@/components/ui";
import { personalApi } from "@/features/personal";
import { AgentRoleEditDialog } from "@/features/sessions/agent-role";

export function PersonaEditDialog({
  agent,
  onOpenChange,
}: {
  agent: PersonalAgentRecord | null;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useTranslation("personal");
  const [instructions, setInstructions] = useState(
    agent?.role.instructions ?? "",
  );
  const [soul, setSoul] = useState(agent?.soul ?? "");

  const save = async (payload: SaveAgentRolePayload) => {
    if (!agent) throw new Error("No assistant to save");
    const { id: _id, ...role } = payload;
    const saved = await personalApi.update({
      id: agent.id,
      role: { ...role, instructions: instructions.trim() || null },
      soul,
    });
    return saved.role;
  };

  return (
    <AgentRoleEditDialog
      agentLocked
      descriptionPlaceholder={t("edit.descriptionPlaceholder")}
      onOpenChange={onOpenChange}
      open={agent !== null}
      role={agent?.role ?? null}
      save={save}
      title={t("edit.title")}
    >
      <Field>
        <FieldLabel htmlFor="persona-instructions">
          {t("edit.instructions")}
        </FieldLabel>
        <Textarea
          id="persona-instructions"
          className="max-h-60 min-h-24"
          placeholder={t("edit.instructionsPlaceholder")}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="persona-soul">{t("edit.soul")}</FieldLabel>
        <Textarea
          id="persona-soul"
          className="max-h-60 min-h-24"
          maxLength={PERSONAL_AGENT_SOUL_MAX_LENGTH}
          placeholder={t("edit.soulPlaceholder")}
          value={soul}
          onChange={(event) => setSoul(event.target.value)}
        />
      </Field>
    </AgentRoleEditDialog>
  );
}
