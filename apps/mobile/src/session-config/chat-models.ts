import { isChatCapableModel, isChatSupportedApi } from "@cocurdex/shared";
import useSWR from "swr";
import { hostConnection } from "@/connection";

export function useChatModels(hostId: string) {
  return useSWR(
    ["provider.listConfigs", "provider.listAllModels", hostId] as const,
    async ([listProviders, listModels, host]) => {
      const connection = hostConnection(host);
      const [configs, models] = await Promise.all([
        connection.request(listProviders),
        connection.request(listModels, {}),
      ]);
      const providers = new Map(configs.map((config) => [config.id, config]));
      return models.flatMap((model) => {
        const provider = providers.get(model.providerId);
        return provider?.enabled &&
          model.enabled &&
          isChatSupportedApi(model.api) &&
          isChatCapableModel(model.capabilities)
          ? [{ provider, model }]
          : [];
      });
    },
    { dedupingInterval: 0 },
  );
}

export type ChatModel = NonNullable<
  ReturnType<typeof useChatModels>["data"]
>[number];
