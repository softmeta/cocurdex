import type { SavedHost } from "@cocurdex/client-runtime";
import {
  PERSONAL_AGENT_RUNTIME_ID,
  PERSONAL_AGENT_SOUL_MAX_LENGTH,
  type PersonalAgentRecord,
  type PersonalAgentRolePayload,
  resolveAgentRoleAvatar,
} from "@cocurdex/shared";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, StyleSheet, Text } from "react-native";
import { AvatarEmojiField, AvatarPicker, useCompatibleModels } from "@/agents";
import { hostConnection } from "@/connection";
import { ChoiceRow } from "@/session-runtime";
import { useThemeColors } from "@/theme";
import {
  FieldSection,
  Form,
  FormSection,
  FormTextField,
  keyboardHidden,
  ListNotice,
  ModalCloseButton,
  PendingIndicator,
  SheetAction,
  useOptionSheet,
} from "@/ui";
import {
  revalidateAssistant,
  useAssistantDraft,
  usePersonalAgents,
} from "./assistant-queries";
import { greetPersonalAgent } from "./persona-greeting";

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

type Subject =
  | { kind: "edit"; agent: PersonalAgentRecord }
  | { kind: "create"; role: PersonalAgentRolePayload };

function baseRole(subject: Subject): PersonalAgentRolePayload {
  if (subject.kind === "create") return subject.role;
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    ...fields
  } = subject.agent.role;
  return fields;
}

function draftOf(subject: Subject): AssistantDraft {
  const role = baseRole(subject);
  return {
    name: role.name,
    description: role.description ?? "",
    instructions: role.instructions ?? "",
    soul: subject.kind === "edit" ? (subject.agent.soul ?? "") : "",
  };
}

function rolePayload(
  subject: Subject,
  draft: AssistantDraft,
): PersonalAgentRolePayload {
  const base = baseRole(subject);
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
  if (!agentId) return <CreateForm host={host} />;
  if (!agents) return <PendingIndicator />;
  const agent = agents.find((item) => item.id === agentId) ?? null;
  if (!agent) return <ModalCloseButton />;
  return <Editor host={host} subject={{ kind: "edit", agent }} />;
}

function CreateForm({ host }: { host: SavedHost }) {
  const { t } = useTranslation(["assistant", "sessions"]);
  const draft = useAssistantDraft(host.hostId);
  if (draft.data?.modelAvailable) {
    return (
      <Editor host={host} subject={{ kind: "create", role: draft.data.role }} />
    );
  }
  if (!draft.data && !draft.error) return <PendingIndicator />;
  return (
    <>
      <Stack.Screen options={{ title: t("form.newTitle") }} />
      <ModalCloseButton />
      <ListNotice
        icon={{ ios: "cpu", android: "memory" }}
        title={draft.error ? t("form.draftFailed") : t("form.needsModel")}
        action={
          draft.error
            ? {
                label: t("sessions:unavailable.retry"),
                onPress: () => void draft.mutate(),
              }
            : undefined
        }
      />
    </>
  );
}

function Editor({ host, subject }: { host: SavedHost; subject: Subject }) {
  const { t } = useTranslation(["assistant", "sessions"]);
  const router = useRouter();
  const colors = useThemeColors();
  const agent = subject.kind === "edit" ? subject.agent : null;
  const [initial] = useState(() => draftOf(subject));
  const [draft, setDraft] = useState(initial);
  const [model, setModel] = useState<AssistantModel>(() => {
    const { providerId, modelId, modelName } = baseRole(subject);
    return { providerId, modelId, modelName };
  });
  const [avatar, setAvatar] = useState(() => {
    const role = baseRole(subject);
    if (role.avatar || agent) return role.avatar ?? null;
    return resolveAgentRoleAvatar({ id: "", avatar: null });
  });
  const avatarChanged =
    agent !== null &&
    JSON.stringify(avatar) !== JSON.stringify(agent.role.avatar ?? null);
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
      avatarChanged ||
      model.providerId !== agent.role.providerId ||
      model.modelId !== agent.role.modelId);
  const field = (key: keyof AssistantDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailed(false);
    const connection = hostConnection(host.hostId);
    const role = { ...rolePayload(subject, draft), ...model, avatar };
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
      greetPersonalAgent(host, saved.id);
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
        <FieldSection title={t("form.avatar.title")}>
          <AvatarPicker
            role={{ id: agent?.role.id ?? "", name: draft.name, avatar }}
            onChange={setAvatar}
          />
          <AvatarEmojiField
            role={{ id: agent?.role.id ?? "", name: draft.name, avatar }}
            onChange={setAvatar}
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
