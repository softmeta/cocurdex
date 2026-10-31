import type { SavedHost } from "@cocurdex/client-runtime";
import {
  type AgentPermissionMode,
  isAgentPermissionModeSupportedForModel,
  type SessionRuntimeSelection,
  sessionConfigurationOf,
} from "@cocurdex/shared";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePermissionModeLabels } from "@/agents";
import { hostConnection } from "@/connection";
import { RuntimeRows } from "@/session-runtime";
import {
  CloseButton,
  Form,
  FormNote,
  FormSection,
  useOptionSheet,
  ValueFormRow,
} from "@/ui";
import { ConfigOptionRows } from "./config-option-rows";
import { McpSection } from "./mcp-section";
import { useSessionConfigState } from "./session-config-state";

export function SessionConfigScreen({
  host,
  sessionId,
}: {
  host: SavedHost;
  sessionId: string;
}) {
  const { t } = useTranslation("sessions");
  const router = useRouter();
  const done = () => router.dismiss();
  const modeLabels = usePermissionModeLabels();
  const { session, agent, models, snapshot, axes, configOptions, mcpServers } =
    useSessionConfigState(host, sessionId);
  const [failed, setFailed] = useState(false);
  const open = useOptionSheet();
  const canInteract = host.scopes.includes("interact");
  const canConfigure = host.scopes.includes("execute");
  const connection = hostConnection(host.hostId);

  const attempt = async (run: () => Promise<unknown>) => {
    setFailed(false);
    try {
      await run();
    } catch {
      setFailed(true);
    }
  };

  const updateRuntime = (patch: {
    model?: { providerId: string; modelId: string };
    runtime?: SessionRuntimeSelection;
  }) =>
    attempt(() =>
      connection.request("session.updateRuntime", { sessionId, ...patch }),
    );

  const setConfigOption = (configId: string, value: boolean | string) =>
    void attempt(() =>
      connection.request("session.setConfig", { sessionId, configId, value }),
    );

  const choosePermissionMode = (permissionMode: AgentPermissionMode) => {
    if (!session) return;
    void attempt(() =>
      connection.request("session.configure", {
        ...sessionConfigurationOf(session),
        permissionMode,
      }),
    );
  };

  const permissionModes = (agent?.capabilities.permissionModes ?? []).filter(
    (mode) =>
      !session ||
      isAgentPermissionModeSupportedForModel(
        session.agentType,
        mode.id,
        snapshot?.modelId,
        snapshot?.modelName,
      ),
  );
  const selectedMode = session?.permissionMode;

  return (
    <>
      <Stack.Screen options={{ title: agent?.label ?? "" }} />
      <CloseButton
        accessibilityLabel={t("sessionConfig.close")}
        onPress={done}
      />
      <Form>
        {failed ? (
          <FormSection
            footer={
              <FormNote testID="session-config-failed" tone="destructive">
                {t("detail.actionFailed")}
              </FormNote>
            }
          />
        ) : null}
        <FormSection
          footer={
            canConfigure || permissionModes.length === 0 ? undefined : (
              <FormNote>{t("sessionConfig.modeNeedsExecute")}</FormNote>
            )
          }
        >
          <ValueFormRow
            testID="session-config-model"
            label={t("newSession.model")}
            value={snapshot?.modelName ?? t("newSession.agentDefaultModel")}
            onPress={() =>
              open({
                title: t("newSession.model"),
                items: models.map(({ provider, model }) => ({
                  key: `${provider.id}/${model.modelId}`,
                  testID: `session-config-model-${model.modelId}`,
                  label: model.name,
                  supporting: provider.name,
                  selected:
                    snapshot?.providerId === provider.id &&
                    snapshot.modelId === model.modelId,
                  onPress: () => {
                    if (!canInteract) return;
                    void updateRuntime({
                      model: {
                        providerId: provider.id,
                        modelId: model.modelId,
                      },
                    });
                  },
                })),
              })
            }
          />
          {axes && canInteract ? (
            <RuntimeRows
              axes={axes}
              open={open}
              onChange={(runtime) => void updateRuntime({ runtime })}
            />
          ) : null}
          {canInteract && configOptions.length > 0 ? (
            <ConfigOptionRows
              options={configOptions}
              open={open}
              onChange={setConfigOption}
            />
          ) : null}
          {permissionModes.length > 0 ? (
            <ValueFormRow
              testID="session-config-mode"
              label={t("newSession.mode")}
              value={selectedMode ? modeLabels[selectedMode].label : ""}
              onPress={() =>
                open({
                  title: t("newSession.mode"),
                  items: permissionModes.map((mode) => ({
                    key: mode.id,
                    testID: `session-config-mode-${mode.id}`,
                    label: modeLabels[mode.id].label,
                    supporting: modeLabels[mode.id].description,
                    destructive: mode.risk === "dangerous",
                    selected: mode.id === selectedMode,
                    onPress: () => {
                      if (canConfigure) choosePermissionMode(mode.id);
                    },
                  })),
                })
              }
            />
          ) : null}
        </FormSection>
        {mcpServers ? <McpSection servers={mcpServers} /> : null}
        {canInteract && session ? (
          <FormSection>
            <ValueFormRow
              testID="session-config-save-role"
              label={t("saveRole.open")}
              value=""
              onPress={() =>
                router.push({
                  pathname: "/session-config/[hostId]/[sessionId]/save-role",
                  params: { hostId: host.hostId, sessionId },
                })
              }
            />
          </FormSection>
        ) : null}
      </Form>
    </>
  );
}
