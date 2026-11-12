import type {
  AgentId,
  AgentProviderSelection,
  CompatibleProviderModel,
} from "@cocurdex/shared";
import { getAgentTraits } from "@cocurdex/shared";
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

  if (getAgentTraits(agentId).modelCatalog === "app-providers") {
    return getItemValue(items[0]);
  }

  return getItemValue(items.find(({ model }) => model.isDefault) ?? items[0]);
}
