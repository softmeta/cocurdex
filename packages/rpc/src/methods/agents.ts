import type {
  AcpRegistryAgentId,
  AcpRegistryAgentUpdate,
  AcpRegistryCatalogAgent,
  AcpRegistryInstalledAgent,
  AgentAuthState,
  AgentDescriptor,
  AgentId,
  AgentMcpUnsupportedReason,
  AgentProviderModelAxes,
  AgentProviderSelection,
  AgentRateLimitsReadResult,
  AgentRunLimits,
  AgentSessionMode,
  CodexAccountState,
  CodexLoginOutcome,
  CodexLoginStartResult,
  CompatibleProviderModel,
  InstalledSkillDetail,
  McpConfigFile,
  McpImportCandidate,
  McpLoginOutcome,
  McpLoginStartResult,
  McpProjectConfigFile,
  McpServerConfig,
  McpServerStatus,
  McpStatusReport,
  PiModelsJson,
  ProductSkillDetail,
  ProductSkillShowPayload,
  ProductSkillsInstallResult,
  ProductSkillsRemoveResult,
  ProductSkillsRequestPayload,
  ProductSkillsStatusResult,
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthState,
  ProviderConfigRecord,
  ProviderImportResult,
  ProviderListModelsResult,
  ProviderModelRecord,
  ProviderTemplateRecord,
  SkillAddRequest,
  SkillAddResult,
  SkillAgentLinkPayload,
  SkillCatalogAuditPayload,
  SkillCatalogAuditResult,
  SkillCatalogSearchPayload,
  SkillCatalogSearchResult,
  SkillCatalogSourcesResult,
  SkillLibraryList,
  SkillListPayload,
  SkillRef,
  SkillRemoveResult,
  SkillResolveDuplicatePayload,
  SkillSourceInspectPayload,
  SkillSourceShowPayload,
  SkillSourceSkillDetail,
  SkillSourceSnapshot,
  SkillUpdateCheckResult,
  SkillUpdatePreview,
  SkillUpdateSkipPayload,
  SkillUpdateSkipResult,
  SkillUpdatesApplyPayload,
  SkillUpdatesApplyResult,
  TitleModelProbeResult,
  TitleModelSelection,
} from "@cocurdex/shared";

export type AgentsRequests = {
  "agent.list": undefined;
  "agent.setEnabled": { agentId: AgentId; enabled: boolean };
  "agent.sessionModes.read": { agentId: AgentId };
  "agent.login": { agentId: AgentId; methodId?: string };
  "agent.login.cancel": { agentId: AgentId };
  "agent.logout": { agentId: AcpRegistryAgentId };
  "agent.auth.read": { agentId: AcpRegistryAgentId };
  "agent.rateLimits.read": { agentIds: AgentId[] };
  "acpRegistry.catalog": { forceRefresh?: boolean };
  "acpRegistry.install": { registryId: string };
  "acpRegistry.installCommand": {
    registryId: string;
    command: string;
    args: string[];
  };
  "acpRegistry.uninstall": { agentId: AcpRegistryAgentId };
  "acpRegistry.updates": { forceRefresh?: boolean };
  "acpRegistry.update": { agentId: AcpRegistryAgentId };
  "provider.apiKey.set": { providerId: string; apiKey: string | null };
  "provider.listTemplates": undefined;
  "provider.config.get": { providerId: string };
  "provider.config.save": { config: ProviderConfigRecord };
  "provider.config.delete": { providerId: string };
  "provider.model.save": { model: ProviderModelRecord };
  "provider.model.delete": { providerId: string; modelId: string };
  "provider.model.reset": { providerId: string; modelId: string };
  "provider.fetchModels": { providerId: string };
  "provider.listAllModels": {
    providerIds?: string[];
    forceRefresh?: boolean;
  };
  "provider.default.get": { agentId: AgentId };
  "provider.default.set": {
    agentId: AgentId;
    providerId: string;
    modelId: string;
  };
  "provider.titleModel.get": undefined;
  "provider.titleModel.set": { selection: TitleModelSelection | null };
  "provider.titleModel.probe": { selection: TitleModelSelection };
  "provider.auth.read": { providerId: string };
  "provider.auth.logout": { providerId: string };
  "provider.auth.login.start": {
    providerId: string;
    method: ProviderAuthMethod;
  };
  "provider.auth.login.next": { loginId: string };
  "provider.auth.login.respond": {
    loginId: string;
    promptId: string;
    value: string;
  };
  "provider.auth.login.cancel": { loginId: string };
  "provider.importJson": { json: string };
  "provider.exportJson": undefined;
  "codex.account.read": undefined;
  "codex.logout": undefined;
  "codex.login.start": undefined;
  "codex.login.wait": { loginId: string };
  "codex.login.cancel": { loginId: string };
  "mcp.readConfig": undefined;
  "mcp.saveConfig": { content: string };
  "mcp.readProjectConfig": { workspaceId: string };
  "mcp.server.save": {
    name: string;
    config: McpServerConfig;
    previousName?: string;
  };
  "mcp.server.remove": { name: string };
  "mcp.server.setEnabled": { name: string; enabled: boolean };
  "mcp.server.setAgents": { name: string; agents: AgentId[] };
  "mcp.injection.check": undefined;
  "mcp.servers.merge": { servers: Record<string, McpServerConfig> };
  "mcp.status": { workspaceId?: string; names?: string[] };
  "mcp.server.test": {
    name: string;
    config: McpServerConfig;
    workspaceId?: string;
  };
  "mcp.login.start": { name: string; workspaceId?: string };
  "mcp.login.wait": { loginId: string };
  "mcp.login.cancel": { loginId: string };
  "mcp.logout": { name: string; workspaceId?: string };
  "mcp.import.scan": { workspaceId?: string };
  "skills.pack.getStatus": ProductSkillsRequestPayload;
  "skills.pack.install": ProductSkillsRequestPayload;
  "skills.pack.remove": ProductSkillsRequestPayload;
  "skills.pack.show": ProductSkillShowPayload;
  "skills.list": SkillListPayload;
  "skills.show": SkillRef;
  "skills.remove": SkillRef;
  "skills.setAgentLink": SkillAgentLinkPayload;
  "skills.share": SkillRef;
  "skills.resolveDuplicate": SkillResolveDuplicatePayload;
  "skills.catalog.search": SkillCatalogSearchPayload;
  "skills.catalog.sources": undefined;
  "skills.catalog.audit": SkillCatalogAuditPayload;
  "skills.source.inspect": SkillSourceInspectPayload;
  "skills.source.show": SkillSourceShowPayload;
  "skills.add": SkillAddRequest;
  "skills.updates.check": SkillListPayload;
  "skills.updates.preview": SkillRef;
  "skills.updates.apply": SkillUpdatesApplyPayload;
  "skills.updates.skip": SkillUpdateSkipPayload;
  "provider.listConfigs": undefined;
  "agent.runLimits.get": undefined;
  "agent.runLimits.set": { limits: AgentRunLimits };
  "provider.listModels": { providerId?: string };
  "provider.listCompatibleForAgent": {
    agentId: AgentId;
    forceRefresh?: boolean;
  };
  "provider.modelAxes.probe": { agentId: AgentId; modelId: string };
  "provider.listDefaults": undefined;
};

export type AgentsResults = {
  "agent.list": AgentDescriptor[];
  "agent.setEnabled": AgentDescriptor[];
  "agent.sessionModes.read": AgentSessionMode[];
  "agent.login": null;
  "agent.login.cancel": null;
  "agent.logout": null;
  "agent.auth.read": AgentAuthState;
  "agent.rateLimits.read": Partial<Record<AgentId, AgentRateLimitsReadResult>>;
  "acpRegistry.catalog": AcpRegistryCatalogAgent[];
  "acpRegistry.install": AcpRegistryInstalledAgent;
  "acpRegistry.installCommand": AcpRegistryInstalledAgent;
  "acpRegistry.uninstall": null;
  "acpRegistry.updates": AcpRegistryAgentUpdate[];
  "acpRegistry.update": AcpRegistryInstalledAgent;
  "provider.apiKey.set": null;
  "provider.listTemplates": ProviderTemplateRecord[];
  "provider.config.get": ProviderConfigRecord | null;
  "provider.config.save": ProviderConfigRecord;
  "provider.config.delete": null;
  "provider.model.save": ProviderModelRecord;
  "provider.model.delete": null;
  "provider.model.reset": ProviderModelRecord;
  "provider.fetchModels": ProviderListModelsResult;
  "provider.listAllModels": ProviderModelRecord[];
  "provider.default.get": AgentProviderSelection | null;
  "provider.default.set": null;
  "provider.titleModel.get": TitleModelSelection | null;
  "provider.titleModel.set": null;
  "provider.titleModel.probe": TitleModelProbeResult;
  "provider.auth.read": ProviderAuthState;
  "provider.auth.logout": null;
  "provider.auth.login.start": { loginId: string };
  "provider.auth.login.next": ProviderAuthLoginUpdate;
  "provider.auth.login.respond": null;
  "provider.auth.login.cancel": null;
  "provider.importJson": ProviderImportResult;
  "provider.exportJson": PiModelsJson;
  "codex.account.read": CodexAccountState;
  "codex.logout": null;
  "codex.login.start": CodexLoginStartResult;
  "codex.login.wait": CodexLoginOutcome;
  "codex.login.cancel": null;
  "mcp.readConfig": McpConfigFile;
  "mcp.saveConfig": McpConfigFile;
  "mcp.readProjectConfig": McpProjectConfigFile;
  "mcp.server.save": McpConfigFile;
  "mcp.server.remove": McpConfigFile;
  "mcp.server.setEnabled": McpConfigFile;
  "mcp.server.setAgents": McpConfigFile;
  "mcp.injection.check": Record<string, AgentMcpUnsupportedReason | null>;
  "mcp.servers.merge": McpConfigFile;
  "mcp.status": McpStatusReport;
  "mcp.server.test": McpServerStatus;
  "mcp.login.start": McpLoginStartResult;
  "mcp.login.wait": McpLoginOutcome;
  "mcp.login.cancel": null;
  "mcp.logout": { removed: boolean };
  "mcp.import.scan": McpImportCandidate[];
  "skills.pack.getStatus": ProductSkillsStatusResult;
  "skills.pack.install": ProductSkillsInstallResult;
  "skills.pack.remove": ProductSkillsRemoveResult;
  "skills.pack.show": ProductSkillDetail;
  "skills.list": SkillLibraryList;
  "skills.show": InstalledSkillDetail;
  "skills.remove": SkillRemoveResult;
  "skills.setAgentLink": InstalledSkillDetail;
  "skills.share": InstalledSkillDetail;
  "skills.resolveDuplicate": InstalledSkillDetail;
  "skills.catalog.search": SkillCatalogSearchResult;
  "skills.catalog.sources": SkillCatalogSourcesResult;
  "skills.catalog.audit": SkillCatalogAuditResult;
  "skills.source.inspect": SkillSourceSnapshot;
  "skills.source.show": SkillSourceSkillDetail;
  "skills.add": SkillAddResult;
  "skills.updates.check": SkillUpdateCheckResult;
  "skills.updates.preview": SkillUpdatePreview;
  "skills.updates.apply": SkillUpdatesApplyResult;
  "skills.updates.skip": SkillUpdateSkipResult;
  "provider.listConfigs": ProviderConfigRecord[];
  "agent.runLimits.get": AgentRunLimits;
  "agent.runLimits.set": AgentRunLimits;
  "provider.listModels": ProviderListModelsResult;
  "provider.listCompatibleForAgent": CompatibleProviderModel[];
  "provider.modelAxes.probe": AgentProviderModelAxes | null;
  "provider.listDefaults": AgentProviderSelection[];
};
