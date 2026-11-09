import { logoutCodex, readCodexAccount } from "@cocurdex/agent-adapters";
import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { ProviderAuthMethod } from "@cocurdex/shared";
import type { DaemonRequestContext } from "../host-access/request-context";
import type { CocurdexDaemonService } from "../service";
import {
  assertLocalPrincipal,
  assertWorkspaceForRemote,
} from "./principal-guards";

const AGENT_PREFIXES = [
  "agent.",
  "acpRegistry.",
  "codex.",
  "mcp.",
  "provider.",
] as const;

type AgentMethod = Extract<
  DaemonMethod,
  `${(typeof AGENT_PREFIXES)[number]}${string}`
>;

type ProviderMethod = Extract<AgentMethod, `provider.${string}`>;

export function isAgentRequest(
  request: DaemonRequest,
): request is DaemonRequest<AgentMethod> {
  return AGENT_PREFIXES.some((prefix) => request.method.startsWith(prefix));
}

function isProviderRequest(
  request: DaemonRequest<AgentMethod>,
): request is DaemonRequest<ProviderMethod> {
  return request.method.startsWith("provider.");
}

function isProviderAuthMethod(value: unknown): value is ProviderAuthMethod {
  return value === "oauth" || value === "api_key";
}

export async function handleAgentRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest<AgentMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[AgentMethod]> {
  if (isProviderRequest(request)) {
    return handleProviderRequest(service, request);
  }
  switch (request.method) {
    case "agent.list":
      return service.listAgents();
    case "agent.sessionModes.read":
      return service.readAgentSessionModes(request.params.agentId);
    case "agent.login":
      return service.agentAuth.login(request.params);
    case "agent.login.cancel":
      return service.agentAuth.cancelLogin(request.params.agentId);
    case "agent.logout":
      return service.agentAuth.logout(request.params.agentId);
    case "agent.auth.read":
      return service.agentAuth.read(request.params.agentId);
    case "agent.rateLimits.read":
      return service.readAdapterRateLimits(request.params.agentIds);
    case "agent.runLimits.get":
      return service.getAgentRunLimits();
    case "agent.runLimits.set":
      return service.setAgentRunLimits(request.params.limits);
    case "acpRegistry.catalog":
      return service.acpRegistry.listCatalog(request.params);
    case "acpRegistry.install":
      return service.installAcpRegistryAgent(request.params.registryId);
    case "acpRegistry.installCommand":
      return service.installAcpRegistryCommand(request.params);
    case "acpRegistry.uninstall":
      return service.uninstallAcpRegistryAgent(request.params.agentId);
    case "acpRegistry.updates":
      return service.acpRegistry.listUpdates(request.params);
    case "acpRegistry.update":
      return service.updateAcpRegistryAgent(request.params.agentId);
    case "codex.account.read":
      return readCodexAccount();
    case "codex.login.start":
      return service.codexLogins.start();
    case "codex.login.wait":
      return service.codexLogins.wait(request.params.loginId);
    case "codex.login.cancel":
      await service.codexLogins.cancel(request.params.loginId);
      return null;
    case "codex.logout":
      await logoutCodex();
      return null;
    case "mcp.readConfig":
      return service.mcp.config.readConfig();
    case "mcp.saveConfig":
      return service.mcp.config.saveConfig(request.params.content);
    case "mcp.readProjectConfig":
      return service.mcp.readProjectConfig(request.params.workspaceId);
    case "mcp.server.save":
      return service.mcp.config.saveServer(
        request.params.name,
        request.params.config,
        request.params.previousName,
      );
    case "mcp.server.remove":
      return service.mcp.config.removeServer(request.params.name);
    case "mcp.server.setEnabled":
      return service.mcp.config.setServerEnabled(
        request.params.name,
        request.params.enabled,
      );
    case "mcp.server.setAgents":
      return service.mcp.config.setServerAgents(
        request.params.name,
        request.params.agents,
      );
    case "mcp.injection.check":
      return service.mcp.injectionSupport();
    case "mcp.servers.merge":
      return service.mcp.config.mergeServers(request.params.servers);
    case "mcp.status":
      assertWorkspaceForRemote(
        context,
        "mcp.status",
        request.params.workspaceId,
      );
      return service.mcp.status(
        request.params.workspaceId,
        request.params.names,
      );
    case "mcp.server.test":
      assertWorkspaceForRemote(
        context,
        "mcp.server.test",
        request.params.workspaceId,
      );
      return service.mcp.test(
        request.params.name,
        request.params.config,
        request.params.workspaceId,
      );
    case "mcp.login.start":
      assertWorkspaceForRemote(
        context,
        "mcp.login.start",
        request.params.workspaceId,
      );
      return service.mcp.startLogin(
        request.params.name,
        request.params.workspaceId,
      );
    case "mcp.login.wait":
      return service.mcp.logins.wait(request.params.loginId);
    case "mcp.login.cancel":
      service.mcp.logins.cancel(request.params.loginId);
      return null;
    case "mcp.logout":
      return service.mcp.logout(
        request.params.name,
        request.params.workspaceId,
      );
    case "mcp.import.scan":
      assertLocalPrincipal(context, "mcp.import.scan");
      return service.mcp.scanImports(request.params.workspaceId);
  }
}

async function handleProviderRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest<ProviderMethod>,
): Promise<DaemonResultByMethod[ProviderMethod]> {
  const providers = service.providerService;
  switch (request.method) {
    case "provider.apiKey.set":
      await service.providerCredentials.setApiKey(
        request.params.providerId,
        request.params.apiKey,
      );
      return null;
    case "provider.listTemplates":
      return providers.listTemplates();
    case "provider.listConfigs":
      return providers.listProviderConfigs();
    case "provider.config.get":
      return providers.getProviderConfig(request.params.providerId);
    case "provider.config.save":
      return providers.saveProviderConfig(request.params.config);
    case "provider.config.delete":
      await providers.deleteProviderConfig(request.params.providerId);
      return null;
    case "provider.model.save":
      return providers.saveProviderModel(request.params.model);
    case "provider.model.delete":
      await providers.deleteProviderModel(
        request.params.providerId,
        request.params.modelId,
      );
      return null;
    case "provider.model.reset":
      return providers.resetProviderModel(
        request.params.providerId,
        request.params.modelId,
      );
    case "provider.fetchModels":
      return providers.fetchModels(request.params.providerId);
    case "provider.listAllModels":
      return providers.listAllModels(request.params);
    case "provider.listModels":
      return providers.listProviderModels(request.params.providerId);
    case "provider.listCompatibleForAgent":
      return providers.listCompatibleProviderModels(request.params.agentId, {
        forceRefresh: request.params.forceRefresh,
      });
    case "provider.modelAxes.probe":
      return providers.probeAgentModelAxes(
        request.params.agentId,
        request.params.modelId,
      );
    case "provider.listDefaults":
      return providers.listAgentProviderDefaults();
    case "provider.default.get":
      return providers.getAgentProviderDefault(request.params.agentId);
    case "provider.default.set":
      await providers.setAgentProviderDefault(
        request.params.agentId,
        request.params.providerId,
        request.params.modelId,
      );
      return null;
    case "provider.titleModel.get":
      return providers.getTitleModel();
    case "provider.titleModel.set":
      await providers.setTitleModel(request.params.selection);
      return null;
    case "provider.titleModel.probe":
      return providers.probeTitleModel(request.params.selection);
    case "provider.auth.read":
      return providers.readAuthState(request.params.providerId);
    case "provider.auth.logout":
      await providers.authLogout(request.params.providerId);
      return null;
    case "provider.auth.login.start":
      if (!isProviderAuthMethod(request.params.method)) {
        throw new Error("Invalid provider auth method");
      }
      return service.providerLogins.start(
        request.params.providerId,
        request.params.method,
      );
    case "provider.auth.login.next":
      return service.providerLogins.next(request.params.loginId);
    case "provider.auth.login.respond":
      service.providerLogins.respond(
        request.params.loginId,
        request.params.promptId,
        request.params.value,
      );
      return null;
    case "provider.auth.login.cancel":
      service.providerLogins.cancel(request.params.loginId);
      return null;
    case "provider.importJson":
      return providers.importJson(request.params.json);
    case "provider.exportJson":
      return providers.exportJson();
  }
}
