import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchInput } from "@/components";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { cn } from "@/lib";
import { ModelParametersDialog } from "./model-parameters-dialog";
import { ModelRuntimeSelect } from "./model-runtime-select";

const fieldClass =
  "h-7 min-w-0 rounded-control border-border/70 bg-background/60 text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20";

const capabilityOrder = ["chat", "agent", "vision", "reasoning"] as const;

function modelCapabilities(model: ProviderModelRecord) {
  const capabilities = new Set(model.capabilities ?? []);
  if (model.reasoning) capabilities.add("reasoning");
  return capabilityOrder.filter((capability) => capabilities.has(capability));
}

function modelsEmptyText(options: {
  builtIn: boolean;
  hasModels: boolean;
  noMatches: string;
  authenticateToLoad: string;
  empty: string;
}) {
  if (options.hasModels) return options.noMatches;
  return options.builtIn ? options.authenticateToLoad : options.empty;
}

interface ProviderModelsSectionProps {
  draftModel: ProviderModelRecord;
  draftProvider: ProviderConfigRecord;
  isRefreshing: boolean;
  builtIn?: boolean;
  selectedModels: ProviderModelRecord[];
  onDraftModelChange(model: ProviderModelRecord): void;
  onRefreshModels(): Promise<void>;
  onReload(): Promise<void>;
  onSaveModel(model: ProviderModelRecord): Promise<void>;
}

export function ProviderModelsSection({
  draftModel,
  draftProvider,
  isRefreshing,
  builtIn = false,
  selectedModels,
  onDraftModelChange,
  onRefreshModels,
  onReload,
  onSaveModel,
}: ProviderModelsSectionProps) {
  const { t } = useTranslation("settings");
  const [modelQuery, setModelQuery] = useState("");

  const normalizedQuery = modelQuery.trim().toLowerCase();
  const visibleModels = selectedModels
    .filter((model) => {
      if (!normalizedQuery) {
        return true;
      }

      return `${model.name} ${model.modelId}`
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort(
      (first, second) =>
        first.name.localeCompare(second.name) ||
        first.modelId.localeCompare(second.modelId),
    );

  const mixedRuntimes =
    new Set(selectedModels.map((model) => model.api)).size > 1;

  const emptyText = modelsEmptyText({
    builtIn,
    hasModels: selectedModels.length > 0,
    noMatches: t("providers.models.noMatches"),
    authenticateToLoad: t("providers.models.authenticateToLoad"),
    empty: t("providers.models.empty", { provider: draftProvider.name }),
  });

  return (
    <div className="flex min-w-0 flex-col gap-4 py-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <AppSearchInput
            aria-label={t("providers.models.searchPlaceholder")}
            placeholder={t("providers.models.searchPlaceholder")}
            value={modelQuery}
            onChange={(event) => setModelQuery(event.target.value)}
          />
        </div>
        <div className="shrink-0 text-xs text-muted-foreground/70">
          {t("providers.models.showingCount", {
            total: String(selectedModels.length),
            visible: String(visibleModels.length),
          })}
        </div>
        <Button
          className="shrink-0"
          disabled={isRefreshing}
          size="sm"
          type="button"
          variant="ghost"
          onClick={onRefreshModels}
        >
          <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
          {t("providers.actions.refresh")}
        </Button>
        {builtIn ? null : (
          <AddModelDialog
            draftModel={draftModel}
            onDraftModelChange={onDraftModelChange}
            onSaveModel={onSaveModel}
          />
        )}
      </div>

      <div className="overflow-hidden rounded-control bg-muted">
        {visibleModels.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <Table
            className="border-separate border-spacing-0"
            containerClassName="max-h-96"
          >
            <TableHeader className="text-xs font-medium text-muted-foreground">
              <TableRow className="border-border/50">
                <TableHead className="sticky start-0 top-0 z-20 border-e border-border/40 bg-muted px-3 py-1.5">
                  {t("providers.models.title")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5 text-end">
                  {t("providers.fields.contextLimit")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5 text-end">
                  {t("providers.fields.outputLimit")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-full bg-muted px-3 py-1.5">
                  {t("providers.models.columns.capabilities")}
                </TableHead>
                {mixedRuntimes ? (
                  <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                    {t("providers.fields.modelRuntime")}
                  </TableHead>
                ) : null}
                <TableHead className="sticky end-0 top-0 z-20 border-s border-border/40 bg-muted px-3 py-1.5">
                  <span className="sr-only">
                    {t("providers.models.columns.actions")}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-background">
              {visibleModels.map((model) => (
                <TableRow
                  className="border-border/50 last:border-b-0"
                  key={`${model.providerId}:${model.modelId}`}
                >
                  <TableCell className="sticky start-0 z-10 border-e border-border/40 bg-background px-3 py-2">
                    <div
                      className="max-w-64 truncate font-medium"
                      title={model.name}
                    >
                      {model.name}
                    </div>
                    <div className="mt-1 flex max-w-64 items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className="truncate font-mono"
                        title={model.modelId}
                      >
                        {model.modelId}
                      </span>
                      {model.isDefault ? (
                        <span className="shrink-0">
                          {t("providers.models.columns.defaultModel")}
                        </span>
                      ) : null}
                      {model.overridden ? (
                        <span className="shrink-0">
                          {t("providers.models.overridden")}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-end font-mono text-xs text-muted-foreground tabular-nums">
                    {formatLimit(model.contextLimit)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-end font-mono text-xs text-muted-foreground tabular-nums">
                    {formatLimit(model.outputLimit)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    <ModelCapabilities model={model} />
                  </TableCell>
                  {mixedRuntimes ? (
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                      {t(`providers.fields.runtime.${model.api}`)}
                    </TableCell>
                  ) : null}
                  <TableCell className="sticky end-0 z-10 border-s border-border/40 bg-background px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <ModelParametersDialog
                        model={model}
                        builtIn={builtIn}
                        onReload={onReload}
                        onSaveModel={onSaveModel}
                      />
                      <Switch
                        aria-label={t("providers.models.toggleFor", {
                          model: model.name,
                        })}
                        checked={model.enabled}
                        onCheckedChange={(enabled) =>
                          onSaveModel({ ...model, enabled })
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

interface AddModelDialogProps {
  draftModel: ProviderModelRecord;
  onDraftModelChange(model: ProviderModelRecord): void;
  onSaveModel(model: ProviderModelRecord): Promise<void>;
}

function AddModelDialog({
  draftModel,
  onDraftModelChange,
  onSaveModel,
}: AddModelDialogProps) {
  const { t } = useTranslation("settings");
  const [isOpen, setIsOpen] = useState(false);

  async function addModel() {
    await onSaveModel(draftModel);
    setIsOpen(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          className="shrink-0"
          size="sm"
          type="button"
          variant="secondary"
        >
          <Plus />
          {t("providers.actions.add")}
        </Button>
      </DialogTrigger>
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>{t("providers.models.addTitle")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <Label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("providers.fields.modelId")}
            </span>
            <Input
              className={fieldClass}
              placeholder={t("providers.fields.modelId")}
              value={draftModel.modelId}
              onChange={(event) =>
                onDraftModelChange({
                  ...draftModel,
                  modelId: event.target.value,
                })
              }
            />
          </Label>
          <Label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("providers.fields.displayName")}
            </span>
            <Input
              className={fieldClass}
              placeholder={t("providers.fields.displayName")}
              value={draftModel.name}
              onChange={(event) =>
                onDraftModelChange({ ...draftModel, name: event.target.value })
              }
            />
          </Label>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("providers.fields.modelRuntime")}
            </span>
            <ModelRuntimeSelect
              ariaLabel={t("providers.fields.modelRuntime")}
              value={draftModel.api}
              onChange={(value) =>
                onDraftModelChange({
                  ...draftModel,
                  api: value,
                })
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={addModel}>
            {t("providers.models.addTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModelCapabilities({ model }: { model: ProviderModelRecord }) {
  const { t } = useTranslation("settings");
  const capabilities = modelCapabilities(model);
  if (capabilities.length === 0) return "-";
  return (
    <ul className="flex min-w-32 flex-wrap gap-x-2 gap-y-0.5">
      {capabilities.map((capability) => (
        <li key={capability}>
          {t(`providers.fields.capability.${capability}`)}
        </li>
      ))}
    </ul>
  );
}

function formatLimit(value?: number | null) {
  if (!value) return "-";
  return value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);
}
