import type { CompatibleProviderModel } from "@cocurdex/shared";
import type { AcpConnectionFactory } from "../acp/acp-connection";
import {
  listAcpProviderModels,
  resetAcpProviderModelsCache,
} from "../acp/acp-model-catalog";
import { DEVIN_ACP_ARGS, DEVIN_ACP_COMMAND } from "./devin-adapter";

export const DEVIN_PROVIDER_ID = "devin";

const spec = {
  command: DEVIN_ACP_COMMAND,
  args: DEVIN_ACP_ARGS,
  providerId: DEVIN_PROVIDER_ID,
  providerName: "Devin",
};

export function listDevinProviderModels(
  connectionFactory?: AcpConnectionFactory,
  options: { forceRefresh?: boolean; timeoutMs?: number } = {},
): Promise<CompatibleProviderModel[]> {
  return listAcpProviderModels(spec, connectionFactory, options);
}

export function resetDevinProviderModelsCache() {
  resetAcpProviderModelsCache(DEVIN_PROVIDER_ID);
}
