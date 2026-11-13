import type { ProviderModelRecord } from "@cocurdex/shared";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  createPiModelRuntime,
  type PiCatalogRefresh,
} from "./pi-model-runtime";
import {
  isPiBuiltInProviderId,
  mapPiModelsToRecords,
} from "./pi-provider-catalog";

/**
 * Lists a built-in provider's models the way pi sees them: the bundled catalog plus the remote
 * catalog pi caches in `models-store.json`. `network` fetches that catalog again first.
 */
export async function listPiProviderModels(
  userDataPath: string | undefined,
  providerId: string,
  options: { refresh?: Exclude<PiCatalogRefresh, "none"> } = {},
): Promise<ProviderModelRecord[] | null> {
  if (!isPiBuiltInProviderId(providerId)) return null;
  const runtime = await createPiModelRuntime(userDataPath);
  const result = await runtime.refresh({
    allowNetwork: options.refresh === "network",
    force: options.refresh === "network",
    providers: [providerId],
  });
  const error = result.errors.get(providerId);
  if (error) {
    logAdapterDiagnostic("warn", "pi: provider catalog refresh failed", {
      providerId,
      network: options.refresh === "network",
      error: error.message,
    });
  }
  return mapPiModelsToRecords(providerId, runtime.getModels(providerId));
}
