import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import type { DaemonState } from "../state";
import { listConfiguredProviderModels } from "./models";

export type ProviderModelState = Pick<
  DaemonState,
  | "getAppSetting"
  | "getProviderConfig"
  | "listProviderConfigs"
  | "listProviderModels"
>;

export interface ConfiguredProviderModel {
  provider: ProviderConfigRecord | null;
  model: ProviderModelRecord | null;
}

export async function findConfiguredProviderModel(
  state: ProviderModelState,
  providerId: string,
  modelId: string,
): Promise<ConfiguredProviderModel> {
  const provider = await state.getProviderConfig(providerId);
  const models = await listConfiguredProviderModels(state, {
    providerIds: [providerId],
  });
  const model =
    models.find(
      (candidate) =>
        candidate.providerId === providerId && candidate.modelId === modelId,
    ) ?? null;
  return { provider, model };
}
