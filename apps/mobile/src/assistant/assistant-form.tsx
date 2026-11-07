import type { SavedHost } from "@cocurdex/client-runtime";
import {
  PERSONAL_AGENT_RUNTIME_ID,
  PERSONAL_AGENT_SOUL_MAX_LENGTH,
  type PersonalAgentRecord,
  type PersonalAgentRolePayload,
  personalAgentRoleDraft,
} from "@cocurdex/shared";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, StyleSheet, Text } from "react-native";
import { useCompatibleModels } from "@/agents";
import { hostConnection } from "@/connection";
import { ChoiceRow } from "@/session-runtime";
import { useThemeColors } from "@/theme";
import {
  FieldSection,
  Form,
  FormSection,
  FormTextField,
  keyboardHidden,
  ModalCloseButton,
  PendingIndicator,
  SheetAction,
  useOptionSheet,
} from "@/ui";
import { revalidateAssistant, usePersonalAgents } from "./assistant-queries";

interface AssistantDraft {
  name: string;
  description: string;
  instructions: string;
  soul: string;
}

type AssistantModel = Pick<
  PersonalAgentRolePayload,
  "providerId" | "modelId" | "modelName"
>;

function draftOf(agent: PersonalAgentRecord | null): AssistantDraft {
  return {
    name: agent?.role.name ?? "",
    description: agent?.role.description ?? "",
    instructions: agent?.role.instructions ?? "",
    soul: agent?.soul ?? "",
  };
}

function rolePayload(
  agent: PersonalAgentRecord | null,
  draft: AssistantDraft,
): PersonalAgentRolePayload {
  const base: PersonalAgentRolePayload = agent
    ? (({ id: _id, createdAt: _created, updatedAt: _updated, ...fields }) =>
        fields)(agent.role)
    : personalAgentRoleDraft(draft.name.trim());
  return {
    ...base,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    instructions: draft.instructions.trim() || null,
  };
}

function sameDraft(left: AssistantDraft, right: AssistantDraft) {
  return (
    left.name.trim() === right.name.trim() &&
    left.description.trim() === right.description.trim() &&
    left.instructions.trim() === right.instructions.trim() &&
    left.soul.trim() === right.soul.trim()
  );
}

export function AssistantForm({
  host,
  agentId,
}: {
  host: SavedHost;
  agentId: string | null;
}) {
  const agents = usePersonalAgents(host.hostId).data;
  if (!agentId) return <Editor host={host} agent={null} />;
  if (!agents) return <PendingIndicator />;
  const agent = agents.find((item) => item.id === agentId) ?? null;
  if (!agent) return <ModalCloseButton />;
  return <Editor host={host} agent={agent} />;
}

function Editor({
  host,
  agent,
}: {
  host: SavedHost;
  agent: PersonalAgentRecord | null;
}) {
  const { t } = useTranslation(["assistant", "sessions"]);
  const router = useRouter();
  const colors = useThemeColors();
  const [initial] = useState(() => draftOf(agent));
  const [draft, setDraft] = useState(initial);
  const [model, setModel] = useState<AssistantModel>(() => ({
    providerId: agent?.role.providerId ?? null,
    modelId: agent?.role.modelId ?? null,
    modelName: agent?.role.modelName ?? null,
  }));
  const models = useCompatibleModels(host.hostId, PERSONAL_AGENT_RUNTIME_ID);
  const open = useOptionSheet();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const canSave =
    !saving &&
    host.scopes.includes("interact") &&
    draft.name.trim() !== "" &&
    (agent === null ||
      !sameDraft(initial, draft) ||
      model.providerId !== agent.role.providerId ||
      model.modelId !== agent.role.modelId);
  const field = (key: keyof AssistantDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailed(false);
    const connection = hostConnection(host.hostId);
    const role = { ...rolePayload(agent, draft), ...model };
    const soul = draft.soul.trim() || null;
    try {
      const saved = agent
        ? await connection.request("personalAgent.update", {
            id: agent.id,
            role,
            soul,
          })
        : await connection.request("personalAgent.create", { role, soul });
      await revalidateAssistant(host.hostId);
      Keyboard.dismiss();
      await keyboardHidden();
      if (agent) {
        router.back();
        return;
      }
      router.replace({
        pathname: "/session/[hostId]/[sessionId]",
        params: { hostId: host.hostId, sessionId: saved.homeSessionId },
      });
    } catch {
      setSaving(false);
      setFailed(true);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{ title: agent ? t("form.editTitle") : t("form.newTitle") }}
      />
      <ModalCloseButton />
      <SheetAction
        label={agent ? t("form.save") : t("form.create")}
        disabled={!canSave}
        onPress={() => void save()}
      />
      <Form adjustsForKeyboard>
        <FieldSection
          footer={
            failed ? (
              <Text style={[styles.failed, { color: colors.destructive }]}>
                {t("form.failed")}
              </Text>
            ) : undefined
          }
        >
          <FormTextField
            testID="assistant-form-name"
            accessibilityLabel={t("form.name")}
            placeholder={t("form.name")}
            defaultValue={initial.name}
            autoFocus={agent === null}
            returnKeyType="next"
            onChangeText={field("name")}
          />
          <FormTextField
            testID="assistant-form-description"
            accessibilityLabel={t("form.description")}
            placeholder={t("form.descriptionPlaceholder")}
            defaultValue={initial.description}
            onChangeText={field("description")}
          />
        </FieldSection>
        <FormSection>
          <ChoiceRow
            open={open}
            title={t("sessions:newSession.model")}
            unsetLabel={
              model.modelName ?? model.modelId ?? t("sessions:runtime.default")
            }
            testIDPrefix="assistant-form-model"
            choices={[
              {
                key: "default",
                label: t("sessions:runtime.default"),
                selected: model.providerId === null && model.modelId === null,
                onPress: () =>
                  setModel({
                    providerId: null,
                    modelId: null,
                    modelName: null,
                  }),
              },
              ...(models.data ?? []).map(({ provider, model: candidate }) => ({
                key: `${provider.id}/${candidate.modelId}`,
                label: candidate.name,
                supporting: provider.name,
                selected:
                  model.providerId === provider.id &&
                  model.modelId === candidate.modelId,
                onPress: () =>
                  setModel({
                    providerId: provider.id,
                    modelId: candidate.modelId,
                    modelName: candidate.name,
                  }),
              })),
            ]}
          />
        </FormSection>
        <FieldSection title={t("form.instructions")}>
          <FormTextField
            testID="assistant-form-instructions"
            accessibilityLabel={t("form.instructions")}
            placeholder={t("form.instructionsPlaceholder")}
            defaultValue={initial.instructions}
            multiline
            style={styles.multiline}
            onChangeText={field("instructions")}
          />
        </FieldSection>
        <FieldSection title={t("form.soul")}>
          <FormTextField
            testID="assistant-form-soul"
            accessibilityLabel={t("form.soul")}
            placeholder={t("form.soulPlaceholder")}
            defaultValue={initial.soul}
            maxLength={PERSONAL_AGENT_SOUL_MAX_LENGTH}
            multiline
            style={styles.multiline}
            onChangeText={field("soul")}
          />
        </FieldSection>
      </Form>
    </>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 112, textAlignVertical: "top" },
  failed: { fontSize: 13, lineHeight: 18 },
});
