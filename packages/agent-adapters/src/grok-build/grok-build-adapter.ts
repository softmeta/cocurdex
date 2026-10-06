import { getAgentDescriptor } from "@cocurdex/agent-core";
import { AcpAgentAdapter } from "../acp/acp-agent-adapter";
import type { AcpConnectionFactory, AcpLaunch } from "../acp/acp-connection";
import {
  buildGrokMcpListParams,
  GROK_MCP_CHANGE_NOTIFICATION_METHODS,
  GROK_MCP_LIST_METHOD,
  parseGrokBuildMcpServers,
} from "./grok-build-mcp";
import {
  fetchGrokBuildModelCatalog,
  GROK_BUILD_PROVIDER_ID,
} from "./grok-build-models";
import {
  buildGrokPermissionParams,
  GROK_PERMISSION_NOTIFICATION_METHOD,
} from "./grok-build-permission-mode";
import { grokBuildPlanApprovalRequest } from "./grok-build-plan-approval";
import {
  GROK_BUILD_INITIALIZE_META,
  getGrokBuildAuthMethodPriority,
} from "./grok-build-process";
import {
  GROK_BUILD_BILLING_METHOD,
  parseGrokBuildRateLimits,
} from "./grok-build-rate-limits";
import {
  buildGrokSessionInfoParams,
  GROK_SESSION_INFO_REQUEST_METHOD,
  parseGrokBuildContextUsage,
} from "./grok-build-session-info";
import {
  buildGrokInterjectParams,
  GROK_INTERJECT_REQUEST_METHOD,
} from "./grok-build-steering";
import { grokBuildSubagentProtocol } from "./grok-build-subagents";

export function createGrokBuildAdapter(
  launch: AcpLaunch,
  connectionFactory?: AcpConnectionFactory,
) {
  return new AcpAgentAdapter(
    {
      ...launch,
      descriptor: getAgentDescriptor(GROK_BUILD_PROVIDER_ID),
      modelProviderId: GROK_BUILD_PROVIDER_ID,
      authMethodPriority: getGrokBuildAuthMethodPriority(),
      initializeMeta: GROK_BUILD_INITIALIZE_META,
      async afterInitialize(connection) {
        await fetchGrokBuildModelCatalog(connection);
      },
      rateLimitsRequest: {
        method: GROK_BUILD_BILLING_METHOD,
        mapResponse: parseGrokBuildRateLimits,
      },
      contextUsageRequest: {
        method: GROK_SESSION_INFO_REQUEST_METHOD,
        buildParams: buildGrokSessionInfoParams,
        mapResponse: parseGrokBuildContextUsage,
      },
      mcpServersRequest: {
        method: GROK_MCP_LIST_METHOD,
        buildParams: buildGrokMcpListParams,
        mapResponse: parseGrokBuildMcpServers,
        changeNotifications: GROK_MCP_CHANGE_NOTIFICATION_METHODS,
      },
      permissionModeNotification: {
        method: GROK_PERMISSION_NOTIFICATION_METHOD,
        buildParams: buildGrokPermissionParams,
      },
      planApprovalRequest: grokBuildPlanApprovalRequest,
      // The app transcript is authoritative, so the agent's replay of every
      // past session update would be deserialized, streamed and dropped.
      // Grok Build reads `noReplay` to skip loading those updates entirely.
      loadSessionMeta: { noReplay: true },
      setModelMeta: (reasoningEffort) => ({ reasoningEffort }),
      steeringRequest: {
        method: GROK_INTERJECT_REQUEST_METHOD,
        buildParams: buildGrokInterjectParams,
      },
      subagentProtocol: grokBuildSubagentProtocol,
    },
    connectionFactory,
  );
}
