import type { ProviderApi } from "./contracts";
import type { ProviderModelRecord } from "./provider-contracts";

/** The runtime most of a provider's catalog models use, for a model added to it by hand. */
export function preferredProviderModelApi(
  models: readonly Pick<ProviderModelRecord, "api" | "source">[],
): ProviderApi | undefined {
  const counts = new Map<ProviderApi, number>();
  for (const model of models) {
    if (model.source === "manual") continue;
    counts.set(model.api, (counts.get(model.api) ?? 0) + 1);
  }
  let preferred: ProviderApi | undefined;
  let preferredCount = 0;
  for (const [api, count] of counts) {
    if (count > preferredCount) {
      preferred = api;
      preferredCount = count;
    }
  }
  return preferred;
}
