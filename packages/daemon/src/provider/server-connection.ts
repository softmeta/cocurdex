import type {
  AgentProviderSnapshot,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";

export interface ServerProviderConnection {
  config: ProviderConfigRecord | null;
  model: ProviderModelRecord | null;
  stored: AgentProviderSnapshot | null;
}

export function withServerProviderConnection(
  snapshot: AgentProviderSnapshot,
  { config, model, stored }: ServerProviderConnection,
): AgentProviderSnapshot {
  if (config) {
    return {
      ...snapshot,
      baseUrl: config.baseUrl,
      headersJson: config.headersJson ?? null,
      providerCompatJson: config.compatJson ?? null,
      modelBaseUrl: model?.baseUrl ?? null,
      api: model?.api ?? snapshot.api,
    };
  }
  const same = stored?.providerId === snapshot.providerId ? stored : null;
  return {
    ...snapshot,
    baseUrl: same?.baseUrl ?? "",
    headersJson: same?.headersJson ?? null,
    providerCompatJson: same?.providerCompatJson ?? null,
    modelBaseUrl: same?.modelBaseUrl ?? null,
    api: same?.api ?? snapshot.api,
  };
}
