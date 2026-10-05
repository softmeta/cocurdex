import {
  type AgentAdapter,
  getAgentDescriptor,
  getInstalledAcpRegistryAgent,
} from "@cocurdex/agent-core";
import {
  type AcpRegistryAgentId,
  type AgentProviderModelAxes,
  type AgentRateLimitsRecord,
  type CompatibleProviderModel,
  getAcpRegistryId,
} from "@cocurdex/shared";
import {
  AcpAgentAdapter,
  type AcpAgentAdapterOptions,
} from "../acp/acp-agent-adapter";
import type { AcpConnectionFactory, AcpLaunch } from "../acp/acp-connection";
import {
  listAcpProviderModels,
  loginAcpProvider,
  probeAcpProviderModelAxes,
} from "../acp/acp-model-catalog";
import {
  createGrokBuildAdapter,
  GROK_BUILD_ARGS,
  getGrokBuildAuthMethodPriority,
  listGrokBuildProviderModels,
  readGrokBuildRateLimits,
} from "../grok-build";

interface AcpAgentAdapterProfile {
  args?: string[];
  authMethodPriority?: () => string[];
  authenticateOnSession?: boolean;
  createAdapter?(
    launch: AcpLaunch,
    connectionFactory?: AcpConnectionFactory,
  ): AgentAdapter;
  listModels?(
    launch: AcpLaunch,
    options: { forceRefresh?: boolean },
  ): Promise<CompatibleProviderModel[]>;
  readRateLimits?(launch: AcpLaunch): Promise<AgentRateLimitsRecord | null>;
}

const adapterProfiles: Readonly<Record<string, AcpAgentAdapterProfile>> = {
  cursor: {
    authMethodPriority: () => ["cursor_login"],
    authenticateOnSession: true,
  },
  "grok-build": {
    args: GROK_BUILD_ARGS,
    authMethodPriority: getGrokBuildAuthMethodPriority,
    createAdapter: createGrokBuildAdapter,
    listModels: (launch, options) =>
      listGrokBuildProviderModels(launch, undefined, options),
    readRateLimits: (launch) => readGrokBuildRateLimits(launch),
  },
};

function requireInstalledAgent(agentId: AcpRegistryAgentId) {
  const agent = getInstalledAcpRegistryAgent(agentId);
  if (!agent) {
    throw new Error(`ACP Registry agent ${agentId} is not installed`);
  }
  return agent;
}

function resolve(agentId: AcpRegistryAgentId) {
  const agent = requireInstalledAgent(agentId);
  const profile = adapterProfiles[getAcpRegistryId(agentId) ?? ""] ?? {};
  const launch: AcpLaunch = {
    command: agent.command,
    args: profile.args ?? agent.args,
    env: agent.env,
  };
  const spec = {
    ...launch,
    authMethodPriority: profile.authMethodPriority?.() ?? [],
    providerId: agentId,
    providerName: agent.name,
  };
  return { launch, profile, spec };
}

export function createAcpRegistryAdapter(
  agentId: AcpRegistryAgentId,
  connectionFactory?: AcpConnectionFactory,
): AgentAdapter {
  const { launch, profile, spec } = resolve(agentId);
  if (profile.createAdapter) {
    return profile.createAdapter(launch, connectionFactory);
  }
  const options: AcpAgentAdapterOptions = {
    ...launch,
    authMethodPriority: spec.authMethodPriority,
    descriptor: getAgentDescriptor(agentId),
    modelProviderId: agentId,
    skipAuthenticate: !profile.authenticateOnSession,
  };
  return new AcpAgentAdapter(options, connectionFactory);
}

export function listAcpRegistryProviderModels(
  agentId: AcpRegistryAgentId,
  options: { forceRefresh?: boolean } = {},
): Promise<CompatibleProviderModel[]> {
  const { launch, profile, spec } = resolve(agentId);
  return profile.listModels
    ? profile.listModels(launch, options)
    : listAcpProviderModels(spec, undefined, options);
}

export function loginAcpRegistryProvider(
  agentId: AcpRegistryAgentId,
): Promise<void> {
  return loginAcpProvider(resolve(agentId).spec);
}

export function probeAcpRegistryProviderModelAxes(
  agentId: AcpRegistryAgentId,
  modelId: string,
): Promise<AgentProviderModelAxes | null> {
  return probeAcpProviderModelAxes(resolve(agentId).spec, modelId);
}

export function readAcpRegistryRateLimits(
  agentId: AcpRegistryAgentId,
): Promise<AgentRateLimitsRecord | null> {
  if (!getInstalledAcpRegistryAgent(agentId)) {
    return Promise.resolve(null);
  }
  const { launch, profile } = resolve(agentId);
  return profile.readRateLimits?.(launch) ?? Promise.resolve(null);
}
