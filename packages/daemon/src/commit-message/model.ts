import {
  listClaudeCliProviderModels,
  listCodexProviderModels,
  listGrokBuildProviderModels,
  listOpenCodeProviderModels,
  listPiProviderModels,
} from "@cocurdex/agent-adapters";
import {
  type CommitMessageModelSelection,
  type CompatibleProviderModel,
  createProviderSnapshotForModel,
  filterCompatibleProviderModels,
  getCompatibleProviderApis,
  type ProviderConfigRecord,
  type ProviderModelRecord,
  type ResolvedCommitMessageModel,
} from "@cocurdex/shared";
import type { DaemonState } from "../state";

const NO_MODEL_ERROR =
  "No commit message model configured. Choose one in Settings → Git, or enter a message.";

export function createCommitMessageProviderSnapshot(
  provider: ProviderConfigRecord,
  model: ProviderModelRecord,
  selection: CommitMessageModelSelection,
) {
  return {
    ...createProviderSnapshotForModel({ provider, model }),
    reasoningEffort: selection.reasoningEffort ?? null,
    thinkingLevel: selection.thinkingLevel ?? null,
    serviceTier: selection.serviceTier ?? null,
    fastMode: selection.fastMode ?? null,
    openCodeAgent: selection.openCodeAgent ?? null,
    openCodeVariant: selection.openCodeVariant ?? null,
  };
}

async function resolveConfiguredModel(
  state: DaemonState,
  selection: CommitMessageModelSelection,
): Promise<CompatibleProviderModel | undefined> {
  const provider = (await state.listProviderConfigs()).find(
    (item) => item.id === selection.providerId,
  );
  if (!provider) return undefined;
  const persisted = await state.listProviderModels(provider.id);
  const builtIn = (await listPiProviderModels(provider)) ?? [];
  const models = new Map(builtIn.map((model) => [model.modelId, model]));
  for (const model of persisted) models.set(model.modelId, model);
  const apis = getCompatibleProviderApis(selection.agentId);
  if (
    ![...models.values()].some(
      (model) => model.enabled && apis.includes(model.api),
    )
  ) {
    const api = apis[0];
    if (api) {
      models.set("", {
        providerId: provider.id,
        modelId: "",
        name: "Provider default",
        api,
        enabled: true,
        source: "manual",
        contextLimit: null,
        outputLimit: null,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt,
      });
    }
  }
  return filterCompatibleProviderModels(
    selection.agentId,
    [...models.values()].map((model) => ({ provider, model })),
  ).find(({ model }) => model.modelId === selection.modelId);
}

export async function resolveCommitMessageModel(
  state: DaemonState,
  selection: CommitMessageModelSelection | null,
): Promise<ResolvedCommitMessageModel> {
  if (!selection) throw new Error(NO_MODEL_ERROR);
  let native: CompatibleProviderModel[] = [];
  switch (selection.agentId) {
    case "claude-agent":
      native = await listClaudeCliProviderModels();
      break;
    case "grok-build":
      native = await listGrokBuildProviderModels();
      break;
    case "opencode":
      native = await listOpenCodeProviderModels();
      break;
    case "codex":
      native = await listCodexProviderModels();
      break;
  }
  let item = native.find(
    ({ provider, model }) =>
      provider.id === selection.providerId &&
      model.modelId === selection.modelId,
  );
  if (!item && (selection.agentId === "pi" || selection.agentId === "codex")) {
    item = await resolveConfiguredModel(state, selection);
  }
  if (!item) throw new Error(NO_MODEL_ERROR);
  return {
    agentId: selection.agentId,
    providerSnapshot: createCommitMessageProviderSnapshot(
      item.provider,
      item.model,
      selection,
    ),
  };
}
