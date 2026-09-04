import type {
  ProviderAuthMethodRecord,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProviderAuthSection } from "./provider-auth-section";
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
  authMethods: ProviderAuthMethodRecord[];
  presetProviderIds: Set<string>;
  onClearApiKey(providerId: string): Promise<void>;
  onRefreshModels(providerId: string): Promise<{ error?: string }>;
  onReload(): Promise<void>;
  onRemoveProvider(providerId: string): Promise<void>;
  onSaveModel(model: ProviderModelRecord): Promise<void>;
  onUpdateProviderEnabled(
    providerId: string,
    enabled: boolean,
  ): Promise<boolean>;
  onSaveProvider(
    provider: ProviderConfigRecord,
    apiKey: string,
  ): Promise<boolean>;
}

export function ProviderEditor({
  provider,
  authMethods,
  selectedProvider,
  selectedModels,
  presetProviderIds,
  onClearApiKey,
  onRefreshModels,
  onReload,
  onRemoveProvider,
  onSaveModel,
  onUpdateProviderEnabled,
  onSaveProvider,
}: ProviderEditorProps) {
  const { t } = useTranslation("settings");
  const [draftProvider, setDraftProvider] =
    useState<ProviderConfigRecord>(provider);
  const [draftModel, setDraftModel] = useState<ProviderModelRecord>(() =>
    createEmptyModel(provider.id),
  );
  const [apiKey, setApiKey] = useState("");
  const [isUpdatingEnabled, setIsUpdatingEnabled] = useState(false);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [modelRefreshStatus, setModelRefreshStatus] = useState<string | null>(
    null,
  );
  const isPresetProvider = presetProviderIds.has(draftProvider.id);

  async function handleSaveProvider() {
    await onSaveProvider(draftProvider, apiKey);
    setApiKey("");
  }

  async function handleEnabledChange(enabled: boolean) {
    const previousProvider = draftProvider;
    const nextProvider = { ...draftProvider, enabled };
    setDraftProvider(nextProvider);
    if (!isPresetProvider || !selectedProvider) {
      return;
    }

    setIsUpdatingEnabled(true);
    const saved = await onUpdateProviderEnabled(nextProvider.id, enabled);
    if (!saved) {
      setDraftProvider(previousProvider);
    }
    setIsUpdatingEnabled(false);
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
          managedAuth={authMethods.length > 0}
          presetProviderIds={presetProviderIds}
          selectedProvider={selectedProvider}
          onApiKeyChange={setApiKey}
          onClearApiKey={() => onClearApiKey(draftProvider.id)}
          onDraftProviderChange={setDraftProvider}
          onEnabledChange={(enabled) => {
            if (!isUpdatingEnabled) {
              void handleEnabledChange(enabled);
            }
          }}
          onRemoveProvider={onRemoveProvider}
          onSaveProvider={handleSaveProvider}
        />
      </SettingsGroup>

      {authMethods.length > 0 ? (
        <ProviderAuthSection
          methods={authMethods}
          providerId={draftProvider.id}
          onAuthChange={async () => {
            if (!selectedProvider) {
              const saved = await onSaveProvider(draftProvider, "");
              if (!saved) {
                return;
              }
            }
            await onRefreshModels(draftProvider.id);
          }}
        />
      ) : null}

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
