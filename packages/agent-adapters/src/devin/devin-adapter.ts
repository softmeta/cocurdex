import {
  type AgentDescriptor,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
} from "@cocurdex/shared";
import { AcpAgentAdapter } from "../acp/acp-agent-adapter";
import type { AcpConnectionFactory } from "../acp/acp-connection";

export const DEVIN_ACP_COMMAND = "devin";
export const DEVIN_ACP_ARGS = ["acp"];
export const DEVIN_ACP_AUTH_METHOD = "devin-browser";

const descriptor: AgentDescriptor = {
  id: "devin",
  label: "Devin",
  availability: "available",
  capabilities: {
    collaborationModes: ["default"],
    permissionModes: getFallbackAgentPermissionModes("devin"),
    writeModes: ["native-write"],
    supportsSteering: false,
    supportsStreaming: true,
    supportsSelections: true,
    sessionTitleStrategy: getAgentSessionTitleStrategy("devin"),
    transport: "acp",
  },
};

export function createDevinAdapter(connectionFactory?: AcpConnectionFactory) {
  return new AcpAgentAdapter(
    {
      command: DEVIN_ACP_COMMAND,
      args: DEVIN_ACP_ARGS,
      descriptor,
      modelProviderId: descriptor.id,
      skipAuthenticate: true,
    },
    connectionFactory,
  );
}
