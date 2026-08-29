import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProviderDetailsSection } from "./provider-details-section";
import { ProviderModelsSection } from "./provider-models-section";
import { SettingsGroup } from "./settings-group";

function createEmptyModel(providerId: string): ProviderModelRecord {
  const now = new Date().toISOString();
  return {
    providerId,
    modelId: "",
    name: "",
    api: "openai-completions",
    enabled: true,
    source: "manual",
    contextLimit: null,
    outputLimit: null,
    createdAt: now,
    updatedAt: now,
  };
}

interface ProviderEditorProps {
  // The provider this editor edits. For a brand-new provider it is an empty
  // record. The parent assigns a stable `key` (provider id or a "new" sentinel)
  // so switching providers remounts the editor with a fresh draft instead of
  // syncing draft state imperatively.
  provider: ProviderConfigRecord;
  // The persisted provider backing this editor, or undefined when creating a
  // new one. Drives delete affordances and "configured" badges.
  selectedProvider?: ProviderConfigRecord;
  selectedModels: ProviderModelRecord[];
  presetProviderIds: Set<string>;
  onClearApiKey(providerId: string): Promise<void>;
  onRefreshModels(providerId: string): Promise<{ error?: string }>;
  onReload(): Promise<void>;
  onRemoveProvider(providerId: string): Promise<void>;
  onSaveModel(model: ProviderModelRecord): Promise<void>;
  onSaveProvider(provider: ProviderConfigRecord, apiKey: string): Promise<void>;
}

export function ProviderEditor({
  provider,
  selectedProvider,
  selectedModels,
  presetProviderIds,
  onClearApiKey,
  onRefreshModels,
  onReload,
  onRemoveProvider,
  onSaveModel,
  onSaveProvider,
}: ProviderEditorProps) {
  const { t } = useTranslation("settings");
  const [draftProvider, setDraftProvider] =
    useState<ProviderConfigRecord>(provider);
  const [draftModel, setDraftModel] = useState<ProviderModelRecord>(() =>
    createEmptyModel(provider.id),
  );
  const [apiKey, setApiKey] = useState("");
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [modelRefreshStatus, setModelRefreshStatus] = useState<string | null>(
    null,
  );
  const isPresetProvider = presetProviderIds.has(draftProvider.id);

  async function handleSaveProvider() {
    await onSaveProvider(draftProvider, apiKey);
    setApiKey("");
  }

  async function handleRefreshModels() {
    setIsRefreshingModels(true);
    setModelRefreshStatus(t("providers.status.refreshingModels"));
    try {
      const result = await onRefreshModels(draftProvider.id);
      setModelRefreshStatus(
        result.error ?? t("providers.status.modelsRefreshed"),
      );
    } catch (error) {
      setModelRefreshStatus(
        error instanceof Error
          ? error.message
          : t("providers.status.modelsRefreshFailed"),
      );
    } finally {
      setIsRefreshingModels(false);
    }
  }

  async function handleSaveModel(model: ProviderModelRecord) {
    await onSaveModel({ ...model, providerId: draftProvider.id });
    setDraftModel(createEmptyModel(draftProvider.id));
  }

  return (
    <>
      <SettingsGroup>
        <ProviderDetailsSection
          apiKey={apiKey}
          draftProvider={draftProvider}
          presetProviderIds={presetProviderIds}
          selectedProvider={selectedProvider}
          onApiKeyChange={setApiKey}
          onClearApiKey={() => onClearApiKey(draftProvider.id)}
          onDraftProviderChange={setDraftProvider}
          onRemoveProvider={onRemoveProvider}
          onSaveProvider={handleSaveProvider}
        />
      </SettingsGroup>

      <SettingsGroup>
        <ProviderModelsSection
          draftModel={draftModel}
          draftProvider={draftProvider}
          isRefreshing={isRefreshingModels}
          readOnly={isPresetProvider}
          refreshStatus={modelRefreshStatus}
          selectedModels={selectedModels}
          onDraftModelChange={setDraftModel}
          onRefreshModels={handleRefreshModels}
          onReload={onReload}
          onSaveModel={handleSaveModel}
        />
      </SettingsGroup>
    </>
  );
}
