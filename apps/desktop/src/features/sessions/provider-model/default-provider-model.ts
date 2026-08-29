import type {
  AgentId,
  AgentProviderSelection,
  CompatibleProviderModel,
} from "@cocurdex/shared";
import {
  CODEX_BUILT_IN_PROVIDER_ID,
  CODEX_DEFAULT_MODEL_ID,
} from "@cocurdex/shared";
import { getProviderModelValue } from "./provider-model-cache";

function getItemValue(item: CompatibleProviderModel | undefined) {
  return item
    ? getProviderModelValue(item.provider.id, item.model.modelId)
    : "";
}

export function getDefaultProviderModelValue(
  agentId: AgentId,
  items: CompatibleProviderModel[],
  defaultSelection: AgentProviderSelection | null,
  preferredSelection?: Pick<AgentProviderSelection, "providerId" | "modelId">,
) {
  const configuredSelection = [preferredSelection, defaultSelection].find(
    (selection) =>
      selection != null &&
      items.some(
        ({ provider, model }) =>
          provider.id === selection.providerId &&
          model.modelId === selection.modelId,
      ),
  );

  if (configuredSelection) {
    return getProviderModelValue(
      configuredSelection.providerId,
      configuredSelection.modelId,
    );
  }

  if (agentId === "codex") {
    const builtInDefault = items.find(
      ({ model, provider }) =>
        provider.id === CODEX_BUILT_IN_PROVIDER_ID && model.isDefault,
    );
    return getProviderModelValue(
      CODEX_BUILT_IN_PROVIDER_ID,
      builtInDefault?.model.modelId ?? CODEX_DEFAULT_MODEL_ID,
    );
  }

  if (
    agentId === "opencode" ||
    agentId === "grok-build" ||
    agentId === "claude-agent"
  ) {
    return getItemValue(items.find(({ model }) => model.isDefault) ?? items[0]);
  }

  if (agentId === "pi") {
    return getItemValue(items[0]);
  }

  return "";
}
