import type { SavedHost } from "@cocurdex/client-runtime";
import {
  type AgentAvailability,
  getSessionRuntimeAxes,
} from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  AgentIcon,
  RoleAvatar,
  useAgentRoles,
  useAgents,
  useCompatibleModels,
  usePermissionModeLabels,
} from "@/agents";
import { useSavedHosts } from "@/hosts";
import { RuntimeRows } from "@/session-runtime";
import { useHostSessions } from "@/sessions";
import {
  CloseButton,
  Form,
  FormSection,
  useOptionSheet,
  ValueFormRow,
} from "@/ui";
import {
  chooseAgent,
  chooseModel,
  choosePermissionMode,
  chooseRole,
  chooseRuntime,
  chooseWorkspace,
  displayedChoices,
  displayedRuntime,
  draftWorkspaceId,
  workspaceChoices,
} from "./new-session-draft";
import { useNewSessionDefaults } from "./new-session-queries";
import { updateNewSessionDraft, useNewSessionState } from "./new-session-store";

const ROW_AVATAR = 32;
const ROW_AGENT_ICON = 22;

function useAvailabilityLabels(): Record<AgentAvailability, string> {
  const { t } = useTranslation("sessions");
  return {
    available: t("newSession.availability.available"),
    missing: t("newSession.availability.missing"),
    unsupported: t("newSession.availability.unsupported"),
    error: t("newSession.availability.error"),
  };
}

function Picker({ host }: { host: SavedHost }) {
  const { t } = useTranslation("sessions");
  const router = useRouter();
  const modeLabels = usePermissionModeLabels();
  const availability = useAvailabilityLabels();
  const { draft } = useNewSessionState();
  const { workspaces, sessions } = useHostSessions(host.hostId);
  const choices = workspaceChoices(workspaces, sessions);
  const workspaceId = draftWorkspaceId(draft, choices);
  const defaults = useNewSessionDefaults(host.hostId, workspaceId, draft).data;
  const shown = displayedChoices(draft, defaults);
  const agentType = shown.agentType;
  const agents = useAgents(host.hostId).data ?? [];
  const roles = useAgentRoles(host.hostId).data ?? [];
  const roleId = roles.some((role) => role.id === draft.roleId)
    ? draft.roleId
    : undefined;
  const models = useCompatibleModels(host.hostId, agentType).data ?? [];
  const selectedMode = shown.permissionMode;
  const selectedModel = models.find(
    ({ provider, model }) =>
      shown.model?.providerId === provider.id &&
      shown.model.modelId === model.modelId,
  )?.model;
  const role = roles.find((entry) => entry.id === roleId);
  const axes = agentType
    ? getSessionRuntimeAxes(
        agentType,
        selectedModel,
        displayedRuntime(draft, agentType, role),
      )
    : null;

  const workspace = choices.find(
    (choice) => choice.workspace.id === workspaceId,
  )?.workspace;
  const agent = agents.find((entry) => entry.id === agentType);
  const open = useOptionSheet();
  const done = () => router.dismiss();

  const openWorkspaces = () =>
    open({
      title: t("newSession.workspace"),
      subtitle: t("newSession.addOnComputer"),
      items: choices.map(({ workspace: entry, sessionCount }) => ({
        key: entry.id,
        testID: `workspace-choice-${entry.id}`,
        label: entry.name,
        supporting: t("newSession.sessionCount", { count: sessionCount }),
        selected: entry.id === workspaceId,
        onPress: () =>
          updateNewSessionDraft((current) =>
            chooseWorkspace(current, entry.id),
          ),
      })),
    });

  const openRoles = () =>
    open({
      title: t("newSession.role"),
      subtitle: t("newSession.roleFooter"),
      items: roles.map((entry) => {
        const roleAgent = agents.find((item) => item.id === entry.agentId);
        return {
          key: entry.id,
          testID: `new-session-role-${entry.id}`,
          label: entry.name,
          leading: (
            <RoleAvatar
              role={entry}
              agentId={entry.agentId}
              size={ROW_AVATAR}
            />
          ),
          supporting: [roleAgent?.label ?? entry.agentId, entry.modelName]
            .filter(Boolean)
            .join(" · "),
          selected: entry.id === roleId,
          onPress: () =>
            roleAgent?.availability === "available"
              ? updateNewSessionDraft((current) => chooseRole(current, entry))
              : undefined,
        };
      }),
    });

  const openAgents = () =>
    open({
      title: t("newSession.agent"),
      items: agents.map((entry) => ({
        key: entry.id,
        testID: `new-session-agent-${entry.id}`,
        label: entry.label,
        leading: <AgentIcon agentId={entry.id} size={ROW_AGENT_ICON} />,
        supporting: availability[entry.availability],
        selected: !roleId && entry.id === agentType,
        onPress: () =>
          entry.availability === "available"
            ? updateNewSessionDraft((current) => chooseAgent(current, entry.id))
            : undefined,
      })),
    });

  const openModels = () =>
    open({
      title: t("newSession.model"),
      subtitle: t("newSession.modelsFromComputer"),
      items: models.map(({ provider, model }) => ({
        key: `${provider.id}/${model.modelId}`,
        testID: `new-session-model-${model.modelId}`,
        label: model.name,
        supporting: provider.name,
        selected:
          shown.model?.providerId === provider.id &&
          shown.model.modelId === model.modelId,
        onPress: () => {
          if (!agentType) return;
          updateNewSessionDraft((current) =>
            chooseModel(current, agentType, {
              providerId: provider.id,
              modelId: model.modelId,
            }),
          );
        },
      })),
    });

  const openModes = () =>
    open({
      title: t("newSession.mode"),
      items: shown.permissionModes.map((mode) => ({
        key: mode,
        testID: `new-session-mode-${mode}`,
        label: modeLabels[mode].label,
        supporting: modeLabels[mode].description,
        selected: mode === selectedMode,
        onPress: () => {
          if (!agentType) return;
          updateNewSessionDraft((current) =>
            choosePermissionMode(current, agentType, mode),
          );
        },
      })),
    });

  return (
    <>
      <CloseButton
        accessibilityLabel={t("sessionConfig.close")}
        onPress={done}
      />
      <Form>
        <FormSection footer={t("newSession.runsOn", { host: host.name })}>
          <ValueFormRow
            testID="new-session-workspace"
            label={t("newSession.workspace")}
            value={workspace?.name ?? t("newSession.none")}
            onPress={openWorkspaces}
          />
        </FormSection>
        <FormSection>
          {roles.length > 0 ? (
            <ValueFormRow
              testID="new-session-role"
              label={t("newSession.role")}
              value={role?.name ?? t("newSession.none")}
              icon={
                role ? (
                  <RoleAvatar role={role} agentId={role.agentId} size={20} />
                ) : undefined
              }
              onPress={openRoles}
            />
          ) : null}
          <ValueFormRow
            testID="new-session-agent-row"
            label={t("newSession.agent")}
            value={agent?.label ?? t("newSession.none")}
            icon={
              agent ? <AgentIcon agentId={agent.id} size={16} /> : undefined
            }
            onPress={openAgents}
          />
          {models.length > 0 ? (
            <ValueFormRow
              testID="new-session-model"
              label={t("newSession.model")}
              value={selectedModel?.name ?? t("newSession.none")}
              onPress={openModels}
            />
          ) : null}
          {shown.permissionModes.length > 0 ? (
            <ValueFormRow
              testID="new-session-mode"
              label={t("newSession.mode")}
              value={
                selectedMode
                  ? modeLabels[selectedMode].label
                  : t("newSession.none")
              }
              onPress={openModes}
            />
          ) : null}
          {axes && agentType ? (
            <RuntimeRows
              axes={axes}
              open={open}
              onChange={(patch) =>
                updateNewSessionDraft((current) =>
                  chooseRuntime(current, agentType, patch),
                )
              }
            />
          ) : null}
        </FormSection>
        {defaults && host.scopes.includes("interact") ? (
          <FormSection>
            <ValueFormRow
              testID="new-session-save-role"
              label={t("saveRole.open")}
              value=""
              onPress={() => router.push("/new-session/config/save-role")}
            />
          </FormSection>
        ) : null}
      </Form>
    </>
  );
}

export function AgentPicker() {
  const { hostId } = useNewSessionState();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  return host ? <Picker host={host} /> : null;
}
