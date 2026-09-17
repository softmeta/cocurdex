import type { CompatibleProviderModel } from "@cocurdex/shared";
import type { AcpConnectionFactory } from "../acp/acp-connection";
import {
  listAcpProviderModels,
  loginAcpProvider,
  resetAcpProviderModelsCache,
} from "../acp/acp-model-catalog";
import {
  CURSOR_ACP_ARGS,
  CURSOR_ACP_AUTH_METHOD,
  CURSOR_ACP_COMMAND,
} from "./cursor-adapter";

export const CURSOR_PROVIDER_ID = "cursor";

const spec = {
  command: CURSOR_ACP_COMMAND,
  args: CURSOR_ACP_ARGS,
  authMethodPriority: [CURSOR_ACP_AUTH_METHOD],
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

export function loginCursorProvider(
  connectionFactory?: AcpConnectionFactory,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  return loginAcpProvider(spec, connectionFactory, options);
}
