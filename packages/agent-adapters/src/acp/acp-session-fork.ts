import type { InitializeResponse } from "@agentclientprotocol/sdk";
import type { ForkProviderSessionPayload } from "@cocurdex/agent-core";
import type { AgentProviderSessionRecord } from "@cocurdex/shared";
import { serializeProviderSessionState } from "../shared";
import type { AcpConnection } from "./acp-connection";
import { mapNegotiatedCapabilities } from "./acp-mappers";

export function canForkAcpSession(
  payload: ForkProviderSessionPayload,
): payload is ForkProviderSessionPayload & {
  source: { providerSessionId: string };
} {
  return (
    payload.userTurnCount === null &&
    payload.source.resumable &&
    Boolean(payload.source.providerSessionId)
  );
}

export async function forkAcpProviderSession(
  payload: ForkProviderSessionPayload & {
    source: { providerSessionId: string };
  },
  connection: AcpConnection,
  initialized: InitializeResponse,
): Promise<AgentProviderSessionRecord | null> {
  if (initialized.agentCapabilities?.sessionCapabilities?.fork == null) {
    return null;
  }
  const capabilities = mapNegotiatedCapabilities(initialized);
  if (!capabilities.resumeSession && !capabilities.loadSession) return null;
  const forked = await connection.forkSession({
    sessionId: payload.source.providerSessionId,
    cwd: payload.workspaceRootPath,
    mcpServers: [],
  });
  return {
    sessionId: payload.targetSessionId,
    providerSessionId: forked.sessionId,
    providerStateJson: serializeProviderSessionState({
      adapter: "acp",
      protocol: "acp",
      protocolVersion: initialized.protocolVersion,
    }),
    providerVersion:
      initialized.agentInfo?.version ?? payload.source.providerVersion,
    resumable: true,
    updatedAt: new Date().toISOString(),
  };
}
