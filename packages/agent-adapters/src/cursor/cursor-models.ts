import type { CompatibleProviderModel } from "@cocurdex/shared";
import type { AcpConnectionFactory } from "../acp/acp-connection";
import {
  listAcpProviderModels,
  resetAcpProviderModelsCache,
} from "../acp/acp-model-catalog";
import { CURSOR_ACP_ARGS, CURSOR_ACP_COMMAND } from "./cursor-adapter";

export const CURSOR_PROVIDER_ID = "cursor";

const spec = {
  command: CURSOR_ACP_COMMAND,
  args: CURSOR_ACP_ARGS,
  providerId: CURSOR_PROVIDER_ID,
  providerName: "Cursor",
};

export function listCursorProviderModels(
  connectionFactory?: AcpConnectionFactory,
  options: { forceRefresh?: boolean; timeoutMs?: number } = {},
): Promise<CompatibleProviderModel[]> {
  return listAcpProviderModels(spec, connectionFactory, options);
}

export function resetCursorProviderModelsCache() {
  resetAcpProviderModelsCache(CURSOR_PROVIDER_ID);
}
