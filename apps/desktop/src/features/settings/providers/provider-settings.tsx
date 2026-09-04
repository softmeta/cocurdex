import type {
  ProviderConfigRecord,
  ProviderModelRecord,
  ProviderTemplateRecord,
  TitleModelProbeResult,
  TitleModelSelection,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { Braces, Plus, Search } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input, Spinner } from "@/components/ui";
import {
  bootstrapProviderModelsAtom,
  invalidateProviderModelCache,
} from "@/features/sessions";
import { cn, desktopApi, useMountEffect } from "@/lib";
import { SettingsSearchableSelect } from "../settings-select";
import { ImportProviderJsonPanel } from "./import-provider-json-panel";
import type {
  ParsedProviderImport,
  ProviderImportWarning,
} from "./parse-provider-json";
import { ProviderEditor } from "./provider-editor";
import { resolveProviderSettingsSurface } from "./provider-settings-surface";
import { applyProviderTemplate } from "./provider-templates";

const NEW_PROVIDER_EDITOR_KEY = "__new__";

const providerTabClassName =
  "flex w-44 shrink-0 flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-start transition-colors";
const templateCardClassName =
  "flex w-44 shrink-0 flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-start transition-colors";
const activeProviderTabClassName =
  "border-primary/30 bg-primary/10 font-medium text-foreground shadow-sm ring-1 ring-primary/10 dark:bg-primary/15";
const inactiveProviderTabClassName =
  "border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/45 hover:text-foreground dark:bg-white/[0.04]";

function ProviderStrip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
      {children}
    </div>
  );
}

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

// First-paint cache: the persisted server data so the panel can render
// instantly before the IPC round-trip resolves. It intentionally holds only
// loaded data plus the last selected provider — never transient editor/draft
// state, which is owned by the keyed ProviderEditor.
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
  } catch {
    // Snapshot persistence is only a first-paint optimization.
  }
}

let providerSettingsSnapshot: ProviderSettingsSnapshot | null =
  readPersistentProviderSettingsSnapshot();

// Dedicated title model is encoded as `providerId|modelId` for the select. A
// model id may contain "|" rarely, so split on the first separator only; a
// provider id never does.
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

export function mergeProviderModels(
  models: ProviderModelRecord[],
  providerId: string,
  providerModels: ProviderModelRecord[],
) {
  return [
    ...models.filter((model) => model.providerId !== providerId),
    ...providerModels,
  ];
}

export function ProviderSettingsPanel() {
  const { t } = useTranslation("settings");
  const bootstrapProviderModels = useSetAtom(bootstrapProviderModelsAtom);
  const [providers, setProviders] = useState<ProviderConfigRecord[]>(
    providerSettingsSnapshot?.providers ?? [],
  );
  const [models, setModels] = useState<ProviderModelRecord[]>(
    providerSettingsSnapshot?.models ?? [],
  );
  const [templates, setTemplates] = useState<ProviderTemplateRecord[]>(
    providerSettingsSnapshot?.templates ?? [],
  );
  // selectedProviderId and isCreatingProvider are pure UI intent. Data loading
  // never writes them, so an in-flight reload can never overwrite the editor
  // the user just opened.
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    providerSettingsSnapshot?.selectedProviderId ?? null,
  );
  const [isCreatingProvider, setIsCreatingProvider] = useState(false);
  // Preset picked from the empty-state template grid: pre-fills a new-provider
  // draft so the user only needs to paste an API key.
  const [pendingTemplateId, setPendingTemplateId] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  // JSON import is a one-shot flow (not a dual editor), so it is a view flag
  // rather than a peer "mode" next to the form.
  const [isImportView, setIsImportView] = useState(false);
  // Encoded `providerId|modelId` of the dedicated title model, or "" for none.
  const [titleModelValue, setTitleModelValue] = useState("");
  // Connectivity probe result for the dedicated title model. Reset when the
  // selection changes so a stale latency does not outlive a different model.
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
  // A provider created from a template takes the template's id, so hide any
  // template already instantiated — otherwise the strip shows a duplicate card
  // next to the real provider.
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
  const editorAuthMethods =
    templates.find((template) => template.id === editorProvider.id)
      ?.authMethods ?? [];

  // Loads server data only. It must never touch UI intent (selection /
  // creating), otherwise an async reload could clobber what the user is doing.
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
      // headersJson may carry auth headers; keep it out of localStorage.
      providers: nextProviders.map((provider) => ({
        ...provider,
        headersJson: null,
      })),
      selectedProviderId: nextProviders[0]?.id ?? null,
      templates: nextTemplates,
    };
    persistProviderSettingsSnapshot(providerSettingsSnapshot);

    // Every provider mutation funnels through reload(), so this is the single
    // point where session pickers must drop their cached provider/model list
    // and the app-wide provider/model store (chat's model picker) must reload.
    invalidateProviderModelCache();
    void bootstrapProviderModels();
  }, [bootstrapProviderModels]);

  // Sync external system (IPC-backed provider store) into local state on mount.
  useMountEffect(() => {
    void reload();
  });

  function selectProvider(provider: ProviderConfigRecord) {
    setSelectedProviderId(provider.id);
    setIsCreatingProvider(false);
    setPendingTemplateId("");
  }

  function startNewProvider() {
    setSelectedProviderId(null);
    setIsCreatingProvider(true);
    setPendingTemplateId("");
  }

  function startNewProviderFromTemplate(templateId: string) {
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
    if (!id || !name || !baseUrl) {
      toast.error(t("providers.status.missingFields"));
      return false;
    }

    const persisted = providers.find((provider) => provider.id === id);
    // The id field is locked when editing an existing provider, so a match
    // while no provider is selected means a new draft is about to silently
    // overwrite an existing config.
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
      // The editor never edits headers; keep whatever the store has so a
      // draft seeded from the sanitized localStorage snapshot can't wipe it.
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

    // With a key configured, pull the provider's model list right away so the
    // user doesn't have to hit refresh manually after setup. Best-effort: a
    // failed fetch still leaves the saved provider in place.
    let fetchedModels: ProviderModelRecord[] | null = null;
    // Fetch whenever the provider can authenticate: either a key was just typed
    // or one is already stored. Otherwise re-saving a configured provider would
    // silently leave it without models.
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

  async function importProvidersFromJson(entries: ParsedProviderImport[]) {
    const now = new Date().toISOString();
    const allWarnings: ProviderImportWarning[] = [];

    try {
      for (const entry of entries) {
        allWarnings.push(...entry.warnings);
        const existing = providers.find(
          (provider) => provider.id === entry.provider.id,
        );
        const provider: ProviderConfigRecord = {
          ...entry.provider,
          // Keep an existing secret link when the import has no literal key.
          apiKeySecretId: existing?.apiKeySecretId ?? null,
          createdAt: existing?.createdAt ?? entry.provider.createdAt ?? now,
          updatedAt: now,
          headersJson:
            entry.provider.headersJson ?? existing?.headersJson ?? null,
          compatJson: entry.provider.compatJson ?? existing?.compatJson ?? null,
        };

        await desktopApi.saveProviderConfig(provider);

        if (entry.apiKey) {
          await desktopApi.setProviderApiKey(provider.id, entry.apiKey);
        }

        for (const model of entry.models) {
          const existingModel = models.find(
            (item) =>
              item.providerId === model.providerId &&
              item.modelId === model.modelId,
          );
          await desktopApi.saveProviderModel({
            ...model,
            createdAt: existingModel?.createdAt ?? model.createdAt ?? now,
            updatedAt: now,
          });
        }
      }
    } catch (error) {
      console.error("Failed to import providers:", error);
      toast.error(t("providers.status.importFailed"));
      throw error;
    }

    const firstId = entries[0]?.provider.id ?? null;
    setSelectedProviderId(firstId);
    setIsCreatingProvider(false);
    setPendingTemplateId("");
    setIsImportView(false);

    toast.success(
      t("providers.status.importSucceeded", { count: entries.length }),
    );
    for (const warning of allWarnings) {
      const messageByCode = {
        authHeaderNoKey: t("providers.importJson.warnings.authHeaderNoKey", {
          id: warning.providerId,
        }),
        commandApiKey: t("providers.importJson.warnings.commandApiKey", {
          id: warning.providerId,
        }),
        envApiKey: t("providers.importJson.warnings.envApiKey", {
          id: warning.providerId,
        }),
        oauthIgnored: t("providers.importJson.warnings.oauthIgnored", {
          id: warning.providerId,
        }),
      } as const;
      toast.warning(messageByCode[warning.code]);
    }

    await reload();
  }

  async function selectTitleModel(value: string) {
    // Instant save; the dropdown itself reflects the selection, so no success
    // toast — only surface failures.
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

  // Group selectable title models by provider, hiding providers with no models.
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

  return (
    <div className="settings-panel-enter flex min-w-0 flex-col gap-6">
      {isImportView ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">
            {t("providers.importJson.title")}
          </div>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setIsImportView(false)}
          >
            {t("providers.importJson.back")}
          </Button>
        </div>
      ) : null}

      {isImportView ? (
        <ImportProviderJsonPanel onImport={importProvidersFromJson} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/65" />
                <Input
                  className="h-8 rounded-control border-border/70 bg-background/60 ps-9 pe-3 text-body shadow-none placeholder:text-muted-foreground/70 focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20"
                  placeholder={t("providers.searchPlaceholder")}
                  value={providerQuery}
                  onChange={(event) => setProviderQuery(event.target.value)}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setIsImportView(true)}
                >
                  <Braces className="size-4" />
                  {t("providers.actions.importJson")}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={startNewProvider}
                >
                  <Plus className="size-4" />
                  {t("providers.actions.newProvider")}
                </Button>
              </div>
            </div>

            <ProviderStrip>
              {filteredProviders.length === 0 &&
              filteredTemplates.length === 0 ? (
                <div
                  className={cn(
                    providerTabClassName,
                    "w-auto min-w-44 cursor-default border-transparent bg-transparent",
                  )}
                >
                  <span className="text-body font-medium text-muted-foreground">
                    {t("providers.empty.noMatches")}
                  </span>
                  <span className="w-full text-2xs">&nbsp;</span>
                </div>
              ) : (
                <>
                  {filteredProviders.map((provider) => {
                    const isActive =
                      surface.kind === "provider" && surface.id === provider.id;
                    const modelCount = models.filter(
                      (model) => model.providerId === provider.id,
                    ).length;

                    return (
                      <button
                        className={cn(
                          providerTabClassName,
                          isActive
                            ? activeProviderTabClassName
                            : inactiveProviderTabClassName,
                        )}
                        aria-pressed={isActive}
                        key={provider.id}
                        type="button"
                        onClick={() => selectProvider(provider)}
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-body font-medium">
                            {provider.name}
                          </span>
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              provider.enabled
                                ? "bg-emerald-500/70"
                                : "bg-muted-foreground/30",
                            )}
                          />
                        </span>
                        <span className="w-full truncate text-2xs text-muted-foreground/70">
                          {t("providers.models.modelCount", {
                            count: modelCount,
                          })}
                        </span>
                      </button>
                    );
                  })}

                  {filteredTemplates.map((template) => {
                    const isActive =
                      isCreatingProvider && pendingTemplateId === template.id;
                    return (
                      <button
                        className={cn(
                          templateCardClassName,
                          isActive
                            ? activeProviderTabClassName
                            : inactiveProviderTabClassName,
                        )}
                        aria-pressed={isActive}
                        key={`template:${template.id}`}
                        type="button"
                        onClick={() =>
                          startNewProviderFromTemplate(template.id)
                        }
                      >
                        <span className="w-full truncate text-body font-medium">
                          {template.name}
                        </span>
                        <span className="w-full truncate text-2xs text-muted-foreground/70">
                          {template.baseUrl}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </ProviderStrip>
          </div>

          {/* Config area: full width below the card strip. */}
          <div className="flex min-w-0 flex-col gap-6">
            {shouldShowProviderEditor ? (
              <ProviderEditor
                authMethods={editorAuthMethods}
                key={editorKey}
                provider={editorProvider}
                selectedProvider={selectedProvider}
                selectedModels={selectedModels}
                presetProviderIds={presetProviderIds}
                onClearApiKey={clearApiKey}
                onRefreshModels={refreshModels}
                onReload={reload}
                onRemoveProvider={removeProvider}
                onSaveModel={saveModel}
                onSaveProvider={saveProvider}
                onUpdateProviderEnabled={updateProviderEnabled}
              />
            ) : null}
            {!shouldShowProviderEditor ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-control border border-dashed border-border/60 px-6 text-center text-body text-muted-foreground">
                {t("providers.templates.description")}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 rounded-control border border-border/60 px-3 py-2.5">
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
                  searchPlaceholder={t("providers.models.searchPlaceholder")}
                  triggerLabel={titleModelSelectedLabel}
                  value={titleModelValue}
                  onChange={(next) => {
                    void selectTitleModel(next);
                  }}
                />
                <Button
                  disabled={
                    !titleModelValue || titleModelProbe.status === "testing"
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
        </>
      )}
    </div>
  );
}
