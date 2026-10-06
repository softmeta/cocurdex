import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  ProviderAuthLoginUpdate,
  TitleModelProbeResult,
} from "@cocurdex/shared";
import { ipcMain } from "electron";
import { chatDaemonOptions } from "../chat";
import {
  idSchema,
  registerHandler,
  registerHandlerArgs,
  schemas,
} from "../ipc";

function registerProviderAuthHandlers() {
  registerHandlerArgs(
    ipcMain,
    "provider:authLoginStart",
    schemas.providerAuthLoginStart,
    async (_event, providerId, method) =>
      requestDaemon(
        "provider.auth.login.start",
        { providerId, method },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:authLoginNext",
    idSchema,
    async (_event, loginId): Promise<ProviderAuthLoginUpdate> =>
      requestDaemon(
        "provider.auth.login.next",
        { loginId },
        await chatDaemonOptions(),
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:authLoginRespond",
    schemas.providerAuthLoginRespond,
    async (_event, loginId, promptId, value) =>
      requestDaemon(
        "provider.auth.login.respond",
        { loginId, promptId, value },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:authLoginCancel",
    idSchema,
    async (_event, loginId) =>
      requestDaemon(
        "provider.auth.login.cancel",
        { loginId },
        await chatDaemonOptions(),
      ),
  );
}

function registerCodexAccountHandlers() {
  ipcMain.handle("codex:accountRead", async () =>
    requestDaemon("codex.account.read", await chatDaemonOptions()),
  );
  ipcMain.handle("codex:loginStart", async () =>
    requestDaemon("codex.login.start", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "codex:loginWait",
    schemas.codexLoginId,
    async (_event, loginId) =>
      requestDaemon("codex.login.wait", { loginId }, await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "codex:loginCancel",
    schemas.codexLoginId,
    async (_event, loginId) =>
      requestDaemon(
        "codex.login.cancel",
        { loginId },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("codex:logout", async () =>
    requestDaemon("codex.logout", await chatDaemonOptions()),
  );
}

export function registerProviderHandlers() {
  registerCodexAccountHandlers();
  registerProviderAuthHandlers();
  ipcMain.handle("provider:listTemplates", async () =>
    requestDaemon("provider.listTemplates", await chatDaemonOptions()),
  );
  ipcMain.handle("provider:listConfigs", async () =>
    requestDaemon("provider.listConfigs", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:saveConfig",
    schemas.providerConfigSave,
    async (_event, config) =>
      requestDaemon(
        "provider.config.save",
        { config },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:deleteConfig",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.config.delete",
        { providerId },
        await chatDaemonOptions(),
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:setApiKey",
    schemas.providerSetApiKey,
    async (_event, providerId, apiKey) =>
      requestDaemon(
        "provider.apiKey.set",
        { providerId, apiKey },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:clearApiKey",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.apiKey.set",
        { providerId, apiKey: null },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:importJson",
    schemas.providerImportJson,
    async (_event, json) =>
      requestDaemon("provider.importJson", { json }, await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:listModels",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.fetchModels",
        { providerId },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:saveModel",
    schemas.providerModelSave,
    async (_event, model) =>
      requestDaemon(
        "provider.model.save",
        { model },
        await chatDaemonOptions(),
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:deleteModel",
    schemas.providerDeleteModel,
    async (_event, providerId, modelId) =>
      requestDaemon(
        "provider.model.delete",
        { providerId, modelId },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:listAllModels", async () =>
    requestDaemon("provider.listAllModels", {}, await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "acpRegistry:catalog",
    schemas.acpRegistryCatalog,
    async (_event, options) =>
      requestDaemon(
        "acpRegistry.catalog",
        options ?? {},
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "acpRegistry:install",
    schemas.acpRegistryId,
    async (_event, registryId) =>
      requestDaemon(
        "acpRegistry.install",
        { registryId },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "acpRegistry:installCommand",
    schemas.acpRegistryCommand,
    async (_event, params) =>
      requestDaemon(
        "acpRegistry.installCommand",
        params,
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "acpRegistry:uninstall",
    schemas.acpRegistryAgentId,
    async (_event, agentId) =>
      requestDaemon(
        "acpRegistry.uninstall",
        { agentId },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "agent:login",
    schemas.agentId,
    async (_event, agentId) =>
      requestDaemon("agent.login", { agentId }, await chatDaemonOptions()),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:listCompatibleForAgent",
    schemas.providerCompatibleForAgent,
    async (_event, agentId, options) =>
      requestDaemon(
        "provider.listCompatibleForAgent",
        {
          agentId,
          forceRefresh: options?.forceRefresh,
        },
        await chatDaemonOptions(),
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:probeModelAxes",
    schemas.providerModelAxesProbe,
    async (_event, agentId, modelId) =>
      requestDaemon(
        "provider.modelAxes.probe",
        { agentId, modelId },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:listDefaults", async () =>
    requestDaemon("provider.listDefaults", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:getDefault",
    schemas.agentId,
    async (_event, agentId) =>
      requestDaemon(
        "provider.default.get",
        { agentId },
        await chatDaemonOptions(),
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:setDefault",
    schemas.providerSetDefault,
    async (_event, agentId, providerId, modelId) =>
      requestDaemon(
        "provider.default.set",
        { agentId, providerId, modelId },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:getTitleModel", async () =>
    requestDaemon("provider.titleModel.get", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:setTitleModel",
    schemas.providerTitleModelSet,
    async (_event, selection) =>
      requestDaemon(
        "provider.titleModel.set",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:probeTitleModel",
    schemas.providerTitleModelProbe,
    async (_event, selection): Promise<TitleModelProbeResult> =>
      requestDaemon(
        "provider.titleModel.probe",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:getCommitMessageModel", async () =>
    requestDaemon("git.commitMessageModel.get", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:setCommitMessageModel",
    schemas.providerCommitMessageModelSet,
    async (_event, selection) =>
      requestDaemon(
        "git.commitMessageModel.set",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:authRead",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.auth.read",
        { providerId },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:authLogout",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.auth.logout",
        { providerId },
        await chatDaemonOptions(),
      ),
  );
}
