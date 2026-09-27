import type {
  AgentProviderSnapshot,
  AgentRuntimeProviderConfig,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import {
  createProviderSnapshotForModel,
  isChatCapableModel,
  isChatSupportedApi,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import type { DaemonState } from "../state";
import { listConfiguredProviderModels } from "./models";
import { getTitleModelSetting } from "./title";

export type ProviderModelState = Pick<
  DaemonState,
  | "getAppSetting"
  | "getProviderConfig"
  | "listProviderConfigs"
  | "listProviderModels"
>;

export type ResolveProviderSnapshot = (
  snapshot: AgentProviderSnapshot,
) => Promise<AgentRuntimeProviderConfig>;

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

export async function resolveChatProvider(
  state: ProviderModelState,
  resolveSnapshot: ResolveProviderSnapshot,
  providerId: string,
  modelId: string,
): Promise<AgentRuntimeProviderConfig> {
  const { provider, model } = await findConfiguredProviderModel(
    state,
    providerId,
    modelId,
  );
  if (!provider?.enabled) {
    throw new Error("Provider is unavailable or disabled");
  }
  if (
    !model?.enabled ||
    !isChatSupportedApi(model.api) ||
    !isChatCapableModel(model.capabilities)
  ) {
    throw new Error("The selected model is unavailable for chat");
  }
  return resolveSnapshot(createProviderSnapshotForModel({ provider, model }));
}

export async function resolveTitleChatProvider(
  state: ProviderModelState,
  resolveSnapshot: ResolveProviderSnapshot,
): Promise<AgentRuntimeProviderConfig | null> {
  try {
    const selection = await getTitleModelSetting(state);
    if (!selection) {
      return null;
    }
    return await resolveChatProvider(
      state,
      resolveSnapshot,
      selection.providerId,
      selection.modelId,
    );
  } catch (error) {
    logDaemonDiagnostic("warn", "chat.titleModelUnavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
