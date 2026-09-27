import type {
  AgentProviderModelAxes,
  CompatibleProviderModel,
} from "@cocurdex/shared";
import type { AcpConnectionFactory } from "../acp/acp-connection";
import {
  listAcpProviderModels,
  loginAcpProvider,
  probeAcpProviderModelAxes,
  resetAcpProviderModelsCache,
} from "../acp/acp-model-catalog";
import {
  DEVIN_ACP_ARGS,
  DEVIN_ACP_AUTH_METHOD,
  DEVIN_ACP_COMMAND,
} from "./devin-adapter";

export const DEVIN_PROVIDER_ID = "devin";

const spec = {
  command: DEVIN_ACP_COMMAND,
  args: DEVIN_ACP_ARGS,
  authMethodPriority: [DEVIN_ACP_AUTH_METHOD],
  providerId: DEVIN_PROVIDER_ID,
  providerName: "Devin",
};

export function listDevinProviderModels(
  connectionFactory?: AcpConnectionFactory,
  options: { forceRefresh?: boolean; timeoutMs?: number } = {},
): Promise<CompatibleProviderModel[]> {
  return listAcpProviderModels(spec, connectionFactory, options);
}

// Devin reveals `thought_level`/`speed` only inside a session running the
// model, so they are probed on demand — one probe session per picked model —
// rather than fanning out over the whole catalog.
export function probeDevinProviderModelAxes(
  modelId: string,
  connectionFactory?: AcpConnectionFactory,
  options: { timeoutMs?: number } = {},
): Promise<AgentProviderModelAxes | null> {
  return probeAcpProviderModelAxes(spec, modelId, connectionFactory, options);
}

export function resetDevinProviderModelsCache() {
  resetAcpProviderModelsCache(DEVIN_PROVIDER_ID);
}

export function loginDevinProvider(
  connectionFactory?: AcpConnectionFactory,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  return loginAcpProvider(spec, connectionFactory, options);
}
