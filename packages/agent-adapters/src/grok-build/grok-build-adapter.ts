import {
  type AgentDescriptor,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
} from "@cocurdex/shared";
import { AcpAgentAdapter } from "../acp/acp-agent-adapter";
import type { AcpConnectionFactory } from "../acp/acp-connection";
import {
  buildGrokMcpListParams,
  GROK_MCP_CHANGE_NOTIFICATION_METHODS,
  GROK_MCP_LIST_METHOD,
  parseGrokBuildMcpServers,
} from "./grok-build-mcp";
import { fetchGrokBuildModelCatalog } from "./grok-build-models";
import {
  buildGrokPermissionParams,
  GROK_PERMISSION_NOTIFICATION_METHOD,
} from "./grok-build-permission-mode";
import { GROK_INLINE_PLAN_TOOL_TITLES } from "./grok-build-plan-approval";
import {
  GROK_BUILD_ARGS,
  GROK_BUILD_COMMAND,
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

const descriptor: AgentDescriptor = {
  id: "grok-build",
  label: "Grok Build",
  availability: "available",
  capabilities: {
    collaborationModes: ["default", "plan"],
    permissionModes: getFallbackAgentPermissionModes("grok-build"),
    writeModes: ["native-write"],
    supportsSteering: true,
    supportsStreaming: true,
    supportsSelections: true,
    sessionTitleStrategy: getAgentSessionTitleStrategy("grok-build"),
    transport: "acp",
  },
};

export function createGrokBuildAdapter(
  connectionFactory?: AcpConnectionFactory,
) {
  return new AcpAgentAdapter(
    {
      command: GROK_BUILD_COMMAND,
      args: GROK_BUILD_ARGS,
      descriptor,
      modelProviderId: descriptor.id,
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
      inlinePlanToolTitles: GROK_INLINE_PLAN_TOOL_TITLES,
      steeringRequest: {
        method: GROK_INTERJECT_REQUEST_METHOD,
        buildParams: buildGrokInterjectParams,
      },
      subagentProtocol: grokBuildSubagentProtocol,
    },
    connectionFactory,
  );
}
