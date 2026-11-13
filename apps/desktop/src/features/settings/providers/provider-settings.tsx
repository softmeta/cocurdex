import type {
  ProviderConfigRecord,
  ProviderModelRecord,
  ProviderTemplateRecord,
  TitleModelProbeResult,
  TitleModelSelection,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppSearchInput } from "@/components";
import { Button, IconButton, Spinner } from "@/components/ui";
import {
  bootstrapProviderModelsAtom,
  invalidateProviderModelCache,
} from "@/features/sessions";
import { cn, desktopApi, useMountEffect } from "@/lib";
import { JsonAddMenu } from "../json-add-menu";
import { JsonDropArea } from "../json-drop-area";
import { SettingsListItem } from "../settings-list-item";
import {
  SettingsMasterDetail,
  type SettingsPane,
} from "../settings-master-detail";
import { SettingsSearchableSelect } from "../settings-select";
import { providerImportWarningMessage } from "./import-warning-message";
import { ProviderEditor } from "./provider-editor";
import { ProviderJsonImport } from "./provider-json-import";
import { resolveProviderSettingsSurface } from "./provider-settings-surface";
import { applyProviderTemplate } from "./provider-templates";

const NEW_PROVIDER_EDITOR_KEY = "__new__";

function createEmptyProvider(): ProviderConfigRecord {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    baseUrl: "",
    enabled: true,
    apiKeySecretId: null,
    headersJson: null,
    createdAt: now,
    updatedAt: now,
  };
}

interface ProviderSettingsSnapshot {
  models: ProviderModelRecord[];
  providers: ProviderConfigRecord[];
  selectedProviderId: string | null;
  templates: ProviderTemplateRecord[];
}

const PROVIDER_SETTINGS_SNAPSHOT_STORAGE_KEY =
  "cocurdex:provider-settings-snapshot:v2";

function getProviderSettingsSnapshotStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProviderSettingsSnapshot(
  value: unknown,
): value is ProviderSettingsSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.providers) &&
    Array.isArray(value.models) &&
    Array.isArray(value.templates) &&
    (typeof value.selectedProviderId === "string" ||
      value.selectedProviderId === null)
  );
}

function readPersistentProviderSettingsSnapshot() {
  const storage = getProviderSettingsSnapshotStorage();
  const rawSnapshot = storage?.getItem(PROVIDER_SETTINGS_SNAPSHOT_STORAGE_KEY);
  if (!rawSnapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSnapshot);
    if (!isProviderSettingsSnapshot(parsed)) {
      storage?.removeItem(PROVIDER_SETTINGS_SNAPSHOT_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage?.removeItem(PROVIDER_SETTINGS_SNAPSHOT_STORAGE_KEY);
    return null;
  }
}

function persistProviderSettingsSnapshot(snapshot: ProviderSettingsSnapshot) {
  const storage = getProviderSettingsSnapshotStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      PROVIDER_SETTINGS_SNAPSHOT_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {}
}

let providerSettingsSnapshot: ProviderSettingsSnapshot | null =
  readPersistentProviderSettingsSnapshot();

function encodeTitleModelValue(selection: TitleModelSelection | null) {
  return selection ? `${selection.providerId}|${selection.modelId}` : "";
}

function decodeTitleModelValue(value: string): TitleModelSelection | null {
  const separator = value.indexOf("|");
  if (separator === -1) {
    return null;
  }

  return {
    providerId: value.slice(0, separator),
    modelId: value.slice(separator + 1),
  };
}

function mergeProviderModels(
  models: ProviderModelRecord[],
  providerId: string,
  providerModels: ProviderModelRecord[],
) {
  return [
    ...models.filter((model) => model.providerId !== providerId),
    ...providerModels,
  ];
}

/** Pi resolves an empty or `{placeholder}` template endpoint from env or login values. */
function hasFixedEndpoint(baseUrl: string) {
  return Boolean(baseUrl) && !baseUrl.includes("{");
}

export function ProviderSettingsPanel() {
  const { t } = useTranslation("settings");
  const bootstrapProviderModels = useSetAtom(bootstrapProviderModelsAtom);
  const [pane, setPane] = useState<SettingsPane>("list");
  const [providers, setProviders] = useState<ProviderConfigRecord[]>(
    providerSettingsSnapshot?.providers ?? [],
  );
  const [models, setModels] = useState<ProviderModelRecord[]>(
    providerSettingsSnapshot?.models ?? [],
  );
  const [templates, setTemplates] = useState<ProviderTemplateRecord[]>(
    providerSettingsSnapshot?.templates ?? [],
  );
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    providerSettingsSnapshot?.selectedProviderId ?? null,
  );
  const [isCreatingProvider, setIsCreatingProvider] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState("");
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [providerQuery, setProviderQuery] = useState("");
  const [titleModelValue, setTitleModelValue] = useState("");
  const [titleModelProbe, setTitleModelProbe] = useState<
    | { status: "idle" }
    | { status: "testing" }
    | { status: "done"; result: TitleModelProbeResult }
  >({ status: "idle" });
  const surface = resolveProviderSettingsSurface({
    isCreatingProvider,
    pendingTemplateId,
    providerIds: providers.map((provider) => provider.id),
    selectedProviderId,
  });
  const selectedProvider =
    surface.kind === "provider"
      ? providers.find((provider) => provider.id === surface.id)
      : undefined;
  const pendingTemplate = pendingTemplateId
    ? templates.find((template) => template.id === pendingTemplateId)
    : undefined;
  const newProviderDraft = pendingTemplate
    ? applyProviderTemplate(createEmptyProvider(), pendingTemplate)
    : createEmptyProvider();
  const editorProvider = selectedProvider ?? newProviderDraft;
  let editorKey = NEW_PROVIDER_EDITOR_KEY;
  if (surface.kind === "create") {
    editorKey = `${NEW_PROVIDER_EDITOR_KEY}:${surface.templateId}`;
  } else if (surface.kind === "provider") {
    editorKey = surface.id;
  }
  const selectedModels = models.filter(
    (model) => model.providerId === editorProvider.id,
  );

  const providerFilterQuery = providerQuery.trim().toLowerCase();
  const filteredProviders = providers.filter((provider) => {
    if (!providerFilterQuery) return true;
    return `${provider.name} ${provider.id}`
      .toLowerCase()
      .includes(providerFilterQuery);
  });
  const providerIds = new Set(providers.map((provider) => provider.id));
  const filteredTemplates = templates.filter((template) => {
    if (providerIds.has(template.id)) return false;
    if (!providerFilterQuery) return true;
    return `${template.name} ${template.id} ${template.baseUrl}`
      .toLowerCase()
      .includes(providerFilterQuery);
  });

  const shouldShowProviderEditor =
    surface.kind === "provider" || surface.kind === "create";
  const presetProviderIds = new Set(templates.map((template) => template.id));
  const openEndpointProviderIds = new Set(
    templates
      .filter((template) => !hasFixedEndpoint(template.baseUrl))
      .map((template) => template.id),
  );
  const editorAuthMethods =
    templates.find((template) => template.id === editorProvider.id)
      ?.authMethods ?? [];

  const reload = useCallback(async () => {
    const [nextProviders, nextModels, nextTemplates, nextTitleModel] =
      await Promise.all([
        desktopApi.listProviderConfigs(),
        desktopApi.listAllProviderModels(),
        desktopApi.listProviderTemplates(),
        desktopApi.getTitleModel(),
      ]);

    setProviders(nextProviders);
    setModels(nextModels);
    setTemplates(nextTemplates);
    setTitleModelValue(encodeTitleModelValue(nextTitleModel));

    providerSettingsSnapshot = {
      models: nextModels,
      providers: nextProviders.map((provider) => ({
        ...provider,
        headersJson: null,
      })),
      selectedProviderId: nextProviders[0]?.id ?? null,
      templates: nextTemplates,
    };
    persistProviderSettingsSnapshot(providerSettingsSnapshot);

    invalidateProviderModelCache();
    void bootstrapProviderModels();
  }, [bootstrapProviderModels]);

  useMountEffect(() => {
    void reload();
  });

  function selectProvider(provider: ProviderConfigRecord) {
    setPane("detail");
    setSelectedProviderId(provider.id);
    setIsCreatingProvider(false);
    setPendingTemplateId("");
  }

  function startNewProvider() {
    setPane("detail");
    setSelectedProviderId(null);
    setIsCreatingProvider(true);
    setPendingTemplateId("");
  }

  function startNewProviderFromTemplate(templateId: string) {
    setPane("detail");
    setSelectedProviderId(null);
    setIsCreatingProvider(true);
    setPendingTemplateId(templateId);
  }

  async function saveProvider(
    draftProvider: ProviderConfigRecord,
    apiKey: string,
  ) {
    const id = draftProvider.id.trim();
    const name = draftProvider.name.trim();
    const baseUrl = draftProvider.baseUrl.trim();
    if (!id || !name || (!baseUrl && !presetProviderIds.has(id))) {
      toast.error(t("providers.status.missingFields"));
      return false;
    }

    const persisted = providers.find((provider) => provider.id === id);
    if (!selectedProvider && persisted) {
      toast.error(t("providers.status.idExists", { id }));
      return false;
    }

    const now = new Date().toISOString();
    const provider = {
      ...draftProvider,
      id,
      name,
      baseUrl,
      headersJson: persisted?.headersJson ?? draftProvider.headersJson,
      updatedAt: now,
      createdAt: draftProvider.createdAt || now,
    };

    try {
      await desktopApi.saveProviderConfig(provider);

      if (apiKey.trim()) {
        await desktopApi.setProviderApiKey(provider.id, apiKey.trim());
      }
    } catch (error) {
      console.error("Failed to save provider:", error);
      toast.error(t("providers.status.saveFailed"));
      return false;
    }

    setSelectedProviderId(provider.id);
    setIsCreatingProvider(false);
    setPendingTemplateId("");

    let fetchedModels: ProviderModelRecord[] | null = null;
    const hasApiKey = Boolean(apiKey.trim() || provider.apiKeySecretId);
    if (hasApiKey) {
      const result = await desktopApi.listProviderModels(provider.id);
      fetchedModels = result.error ? null : result.models;
      if (result.error) {
        toast.error(t("providers.status.modelsRefreshFailed"));
      } else {
        toast.success(t("providers.status.providerSaved"));
      }
    } else {
      toast.success(t("providers.status.providerSaved"));
    }

    await reload();
    if (fetchedModels) {
      setModels((current) =>
        mergeProviderModels(current, provider.id, fetchedModels),
      );
    }
    return true;
  }

  async function removeProvider(providerId: string) {
    try {
      await desktopApi.deleteProviderConfig(providerId);
    } catch (error) {
      console.error("Failed to delete provider:", error);
      toast.error(t("providers.status.deleteFailed"));
      return;
    }
    setSelectedProviderId(null);
    setIsCreatingProvider(false);
    setPendingTemplateId("");
    toast.success(t("providers.status.providerDeleted"));
    await reload();
  }

  async function updateProviderEnabled(providerId: string, enabled: boolean) {
    const provider = providers.find((candidate) => candidate.id === providerId);
    if (!provider) {
      return false;
    }

    try {
      await desktopApi.saveProviderConfig({
        ...provider,
        enabled,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to update provider:", error);
      toast.error(t("providers.status.saveFailed"));
      return false;
    }

    await reload();
    return true;
  }

  async function clearApiKey(providerId: string) {
    try {
      await desktopApi.clearProviderApiKey(providerId);
    } catch (error) {
      console.error("Failed to clear API key:", error);
      toast.error(t("providers.status.saveFailed"));
      return;
    }
    await reload();
  }

  async function refreshAllModels() {
    setIsRefreshingAll(true);
    try {
      const results = await desktopApi.refreshAllProviderModels();
      await reload();
      const failed = results.filter((result) => result.error);
      if (failed.length === 0) {
        toast.success(t("providers.status.allModelsRefreshed"));
        return;
      }
      toast.error(
        t("providers.status.someModelsRefreshFailed", {
          providers: failed.map((result) => result.providerId).join(", "),
        }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("providers.status.modelsRefreshFailed"),
      );
    } finally {
      setIsRefreshingAll(false);
    }
  }

  async function refreshModels(providerId: string) {
    const result = await desktopApi.listProviderModels(providerId);
    await reload();
    if (!result.error) {
      setModels((current) =>
        mergeProviderModels(current, providerId, result.models),
      );
    }
    return { error: result.error ?? undefined };
  }

  async function saveModel(model: ProviderModelRecord) {
    const modelId = model.modelId.trim();
    if (!modelId) {
      toast.error(t("providers.status.missingFields"));
      return;
    }

    const now = new Date().toISOString();
    try {
      await desktopApi.saveProviderModel({
        ...model,
        modelId,
        name: model.name.trim() || modelId,
        updatedAt: now,
        createdAt: model.createdAt || now,
      });
    } catch (error) {
      console.error("Failed to save model:", error);
      toast.error(t("providers.status.saveFailed"));
      return;
    }

    const previous = models.find(
      (item) =>
        item.providerId === model.providerId && item.modelId === modelId,
    );
    if (!previous) {
      toast.success(t("providers.status.modelSaved"));
    } else if (previous.enabled !== model.enabled) {
      toast.success(
        model.enabled
          ? t("providers.status.modelEnabled")
          : t("providers.status.modelDisabled"),
      );
    } else {
      toast.success(t("providers.status.modelSaved"));
    }
    await reload();
  }

  async function importProvidersFromJson(json: string) {
    let result: Awaited<ReturnType<typeof desktopApi.importProviderJson>>;
    try {
      result = await desktopApi.importProviderJson(json);
    } catch (error) {
      console.error("Failed to import providers:", error);
      toast.error(t("providers.status.importFailed"));
      throw error;
    }

    setSelectedProviderId(result.providerIds[0] ?? null);
    setIsCreatingProvider(false);
    setPendingTemplateId("");

    toast.success(
      t("providers.status.importSucceeded", {
        count: result.providerIds.length,
      }),
    );
    for (const warning of result.warnings) {
      toast.warning(providerImportWarningMessage(t, warning));
    }

    await reload();
  }

  async function selectTitleModel(value: string) {
    setTitleModelValue(value);
    setTitleModelProbe({ status: "idle" });
    try {
      await desktopApi.setTitleModel(decodeTitleModelValue(value));
    } catch (error) {
      console.error("Failed to save title model:", error);
      toast.error(t("providers.titleModel.saveFailed"));
    }
  }

  async function probeSelectedTitleModel() {
    const selection = decodeTitleModelValue(titleModelValue);
    if (!selection) {
      toast.error(t("providers.titleModel.selectModelFirst"));
      return;
    }

    setTitleModelProbe({ status: "testing" });
    try {
      const result = await desktopApi.probeTitleModel(selection);
      setTitleModelProbe({ status: "done", result });
    } catch (error) {
      setTitleModelProbe({
        status: "done",
        result: {
          ok: false,
          latencyMs: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  const titleModelProbeStatusText = (() => {
    if (titleModelProbe.status === "testing") {
      return t("providers.titleModel.testing");
    }
    if (titleModelProbe.status !== "done") {
      return null;
    }
    const { result } = titleModelProbe;
    const latencyMs = String(result.latencyMs);
    if (!result.ok) {
      return t("providers.titleModel.probeFailed", {
        latencyMs,
        error: result.error || "Unknown error",
      });
    }
    if (result.title) {
      return t("providers.titleModel.probeOkWithTitle", {
        latencyMs,
        title: result.title,
      });
    }
    return t("providers.titleModel.probeOk", { latencyMs });
  })();

  const titleModelGroups = providers
    .map((provider) => ({
      label: provider.name,
      options: models
        .filter((model) => model.providerId === provider.id)
        .map((model) => ({
          label: model.name || model.modelId,
          value: encodeTitleModelValue({
            providerId: provider.id,
            modelId: model.modelId,
          }),
        })),
    }))
    .filter((group) => group.options.length > 0);

  const titleModelNoneLabel = t("providers.titleModel.none");
  const titleModelSelectedLabel =
    titleModelValue === ""
      ? titleModelNoneLabel
      : (titleModelGroups
          .flatMap((group) => group.options)
          .find((option) => option.value === titleModelValue)?.label ??
        titleModelValue);

  const jsonMessages = {
    invalidFile: t("providers.importJson.invalidFile"),
    pasteTitle: t("providers.importJson.pasteTitle"),
    pasteDescription: t("providers.importJson.pasteDescription"),
    dropActive: t("providers.importJson.dropActive"),
    dropHint: t("providers.importJson.dropAreaHint"),
  };

  return (
    <ProviderJsonImport onImport={importProvidersFromJson}>
      {(onText) => (
        <JsonDropArea messages={jsonMessages} onText={onText}>
          <SettingsMasterDetail
            pane={pane}
            onBack={() => setPane("list")}
            list={
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex shrink-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <AppSearchInput
                      placeholder={t("providers.searchPlaceholder")}
                      value={providerQuery}
                      onChange={(event) => setProviderQuery(event.target.value)}
                    />
                  </div>
                  <IconButton
                    aria-label={t("providers.actions.refreshAllModels")}
                    disabled={isRefreshingAll || providers.length === 0}
                    size="sm"
                    variant="secondary"
                    onClick={() => void refreshAllModels()}
                  >
                    <RefreshCw
                      className={cn(
                        "size-4",
                        isRefreshingAll && "animate-spin",
                      )}
                    />
                  </IconButton>
                  <JsonAddMenu
                    label={t("providers.actions.newProvider")}
                    messages={jsonMessages}
                    variant="secondary"
                    onAddManually={startNewProvider}
                    onText={onText}
                  />
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  <div className="flex flex-col gap-2 pe-1">
                    {filteredProviders.length === 0 &&
                    filteredTemplates.length === 0 ? (
                      <div className="flex w-full cursor-default flex-col items-start gap-0.5 px-3 py-2 text-start">
                        <span className="text-body font-medium text-muted-foreground">
                          {t("providers.empty.noMatches")}
                        </span>
                        <span className="w-full text-2xs">&nbsp;</span>
                      </div>
                    ) : (
                      <>
                        {filteredProviders.map((provider) => {
                          const isActive =
                            surface.kind === "provider" &&
                            surface.id === provider.id;
                          const modelCount = models.filter(
                            (model) => model.providerId === provider.id,
                          ).length;

                          return (
                            <SettingsListItem
                              isActive={isActive}
                              key={provider.id}
                              subtitle={t("providers.models.modelCount", {
                                count: modelCount,
                              })}
                              title={provider.name}
                              trailing={
                                <span
                                  className={cn(
                                    "size-1.5 shrink-0 rounded-full",
                                    provider.enabled
                                      ? "bg-emerald-500/70"
                                      : "bg-muted-foreground/30",
                                  )}
                                />
                              }
                              onClick={() => selectProvider(provider)}
                            />
                          );
                        })}

                        {filteredTemplates.map((template) => {
                          const isActive =
                            isCreatingProvider &&
                            pendingTemplateId === template.id;
                          return (
                            <SettingsListItem
                              isActive={isActive}
                              key={`template:${template.id}`}
                              subtitle={template.baseUrl || template.id}
                              title={template.name}
                              onClick={() =>
                                startNewProviderFromTemplate(template.id)
                              }
                            />
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            }
            detail={
              <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                <div className="flex min-w-0 flex-col gap-6 pe-1">
                  {shouldShowProviderEditor ? (
                    <ProviderEditor
                      authMethods={editorAuthMethods}
                      key={editorKey}
                      provider={editorProvider}
                      selectedProvider={selectedProvider}
                      selectedModels={selectedModels}
                      openEndpointProviderIds={openEndpointProviderIds}
                      presetProviderIds={presetProviderIds}
                      onClearApiKey={clearApiKey}
                      onRefreshModels={refreshModels}
                      onReload={reload}
                      onRemoveProvider={removeProvider}
                      onSaveModel={saveModel}
                      onSaveProvider={saveProvider}
                      onUpdateProviderEnabled={updateProviderEnabled}
                    />
                  ) : (
                    <div className="flex min-h-[160px] items-center justify-center rounded-card bg-settings-surface px-6 text-center text-body text-muted-foreground">
                      {t("providers.templates.description")}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 rounded-card bg-settings-surface px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {t("providers.titleModel.label")}
                        </span>
                        <span className="text-2xs text-muted-foreground">
                          {t("providers.titleModel.description")}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SettingsSearchableSelect
                          ariaLabel={t("providers.titleModel.label")}
                          emptyText={t("providers.models.noMatches")}
                          options={[
                            {
                              value: "",
                              label: titleModelNoneLabel,
                              group: "none",
                              groupLabel: "",
                            },
                            ...titleModelGroups.flatMap((group) =>
                              group.options.map((option) => ({
                                value: option.value,
                                label: option.label,
                                keywords: option.value,
                                group: group.label,
                                groupLabel: group.label,
                              })),
                            ),
                          ]}
                          searchPlaceholder={t(
                            "providers.models.searchPlaceholder",
                          )}
                          triggerLabel={titleModelSelectedLabel}
                          value={titleModelValue}
                          onChange={(next) => {
                            void selectTitleModel(next);
                          }}
                        />
                        <Button
                          disabled={
                            !titleModelValue ||
                            titleModelProbe.status === "testing"
                          }
                          type="button"
                          variant="outline"
                          onClick={() => void probeSelectedTitleModel()}
                        >
                          {titleModelProbe.status === "testing" ? (
                            <Spinner size="sm" />
                          ) : null}
                          {titleModelProbe.status === "testing"
                            ? t("providers.titleModel.testing")
                            : t("providers.titleModel.test")}
                        </Button>
                      </div>
                    </div>
                    {titleModelProbeStatusText ? (
                      <span
                        className={cn(
                          "text-2xs",
                          titleModelProbe.status === "done" &&
                            !titleModelProbe.result.ok
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {titleModelProbeStatusText}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            }
          />
        </JsonDropArea>
      )}
    </ProviderJsonImport>
  );
}
