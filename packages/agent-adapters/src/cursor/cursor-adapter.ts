import {
  type AgentDescriptor,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
} from "@cocurdex/shared";
import { AcpAgentAdapter } from "../acp/acp-agent-adapter";
import type { AcpConnectionFactory } from "../acp/acp-connection";

export const CURSOR_ACP_COMMAND = "cursor-agent";
export const CURSOR_ACP_ARGS = ["acp"];
export const CURSOR_ACP_AUTH_METHOD = "cursor_login";

const descriptor: AgentDescriptor = {
  id: "cursor",
  label: "Cursor",
  availability: "available",
  capabilities: {
    collaborationModes: ["default"],
    permissionModes: getFallbackAgentPermissionModes("cursor"),
    writeModes: ["native-write"],
    supportsSteering: false,
    supportsStreaming: true,
    supportsSelections: true,
    sessionTitleStrategy: getAgentSessionTitleStrategy("cursor"),
    transport: "acp",
  },
};

export function createCursorAdapter(connectionFactory?: AcpConnectionFactory) {
  return new AcpAgentAdapter(
    {
      command: CURSOR_ACP_COMMAND,
      args: CURSOR_ACP_ARGS,
      descriptor,
      modelProviderId: descriptor.id,
      authMethodPriority: [CURSOR_ACP_AUTH_METHOD],
    },
    connectionFactory,
  );
}
