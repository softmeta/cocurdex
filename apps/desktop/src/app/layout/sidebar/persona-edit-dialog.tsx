import {
  PERSONAL_AGENT_SOUL_MAX_LENGTH,
  type PersonalAgentRecord,
  type PersonalAgentRolePayload,
  type SaveAgentRolePayload,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, FieldLabel, Textarea } from "@/components/ui";
import { personalApi, revalidatePersonalAgents } from "@/features/personal";
import { AgentRoleEditDialog } from "@/features/sessions/agent-role";

export function PersonaEditDialog({
  agent = null,
  draft = null,
  onCreated,
  onOpenChange,
}: {
  agent?: PersonalAgentRecord | null;
  draft?: PersonalAgentRolePayload | null;
  onCreated?(created: PersonalAgentRecord): void;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useTranslation("personal");
  const [instructions, setInstructions] = useState(
    agent?.role.instructions ?? "",
  );
  const [soul, setSoul] = useState(agent?.soul ?? "");

  const save = async (payload: SaveAgentRolePayload) => {
    const { id: _id, ...fields } = payload;
    const role = { ...fields, instructions: instructions.trim() || null };
    if (agent) {
      const saved = await personalApi.update({ id: agent.id, role, soul });
      return saved.role;
    }
    if (!draft) throw new Error("No assistant to save");
    const created = await personalApi.create({ role, soul });
    await revalidatePersonalAgents();
    onCreated?.(created);
    return created.role;
  };

  return (
    <AgentRoleEditDialog
      agentLocked
      size="default"
      descriptionPlaceholder={t("edit.descriptionPlaceholder")}
      onOpenChange={onOpenChange}
      open={agent !== null || draft !== null}
      role={agent?.role ?? draft}
      save={save}
      title={t("edit.title")}
    >
      <Field>
        <FieldLabel htmlFor="persona-instructions">
          {t("edit.instructions")}
        </FieldLabel>
        <Textarea
          id="persona-instructions"
          className="max-h-60"
          placeholder={t("edit.instructionsPlaceholder")}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="persona-soul">{t("edit.soul")}</FieldLabel>
        <Textarea
          id="persona-soul"
          className="max-h-60"
          maxLength={PERSONAL_AGENT_SOUL_MAX_LENGTH}
          placeholder={t("edit.soulPlaceholder")}
          value={soul}
          onChange={(event) => setSoul(event.target.value)}
        />
      </Field>
    </AgentRoleEditDialog>
  );
}
