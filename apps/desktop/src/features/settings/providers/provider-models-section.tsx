import {
  type ProviderApi,
  type ProviderConfigRecord,
  type ProviderModelCapability,
  type ProviderModelRecord,
  providerApis,
} from "@cocurdex/shared";
import {
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
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
  Textarea,
} from "@/components/ui";
import { cn, desktopApi } from "@/lib";
import { SettingsSelect } from "../settings-select";

const fieldClass =
  "h-8 min-w-0 rounded-control border-border/70 bg-background/60 text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20";
const textareaClass =
  "min-h-16 min-w-0 rounded-control border-border/70 bg-background/60 font-mono text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20";
const modelCapabilities: ProviderModelCapability[] = [
  "agent",
  "chat",
  "vision",
  "reasoning",
];
const apiOptions = providerApis.map((api) => ({
  label: api,
  value: api,
}));

function parseLimit(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getModelInput(model: ProviderModelRecord) {
  return model.capabilities?.includes("vision") ? "text, image" : "text";
}

function formatCapabilities(model: ProviderModelRecord) {
  return model.capabilities?.length ? model.capabilities.join(", ") : "-";
}

function parseJsonRecord(json?: string | null) {
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatJsonRecord(json?: string | null) {
  const record = parseJsonRecord(json);
  if (!record) {
    return "-";
  }

  return Object.entries(record)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(", ");
}

function formatModelCost(costJson?: string | null) {
  const cost = parseJsonRecord(costJson);
  if (!cost) {
    return "-";
  }

  return [
    ["in", cost.input],
    ["out", cost.output],
    ["read", cost.cacheRead],
    ["write", cost.cacheWrite],
  ]
    .filter(([, value]) => typeof value === "number")
    .map(([label, value]) => `${label} ${value}`)
    .join(" / ");
}

function formatReasoningEfforts(model: ProviderModelRecord) {
  if (!model.supportedReasoningEfforts?.length) {
    return model.defaultReasoningEffort ?? "-";
  }

  const efforts = model.supportedReasoningEfforts.map(
    (option) => option.reasoningEffort,
  );
  return model.defaultReasoningEffort
    ? `${model.defaultReasoningEffort} (${efforts.join(", ")})`
    : efforts.join(", ");
}

function formatServiceTiers(model: ProviderModelRecord) {
  if (!model.serviceTiers?.length) {
    return "-";
  }

  return model.serviceTiers.map((tier) => tier.name || tier.id).join(", ");
}

interface ProviderModelsSectionProps {
  draftModel: ProviderModelRecord;
  draftProvider: ProviderConfigRecord;
  isRefreshing: boolean;
  readOnly?: boolean;
  refreshStatus: string | null;
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
  readOnly = false,
  refreshStatus,
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
    .sort((first, second) => {
      if (first.enabled !== second.enabled) {
        return first.enabled ? -1 : 1;
      }

      return first.name.localeCompare(second.name);
    });

  return (
    <div className="flex min-w-0 flex-col gap-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium">{t("providers.models.title")}</div>
        <div className="flex items-center gap-2">
          <Button
            className="shrink-0"
            disabled={isRefreshing}
            size="sm"
            type="button"
            variant="ghost"
            onClick={onRefreshModels}
          >
            <RefreshCw className={cn(isRefreshing && "animate-spin")} />
            {t("providers.actions.refresh")}
          </Button>
          {readOnly ? null : (
            <AddModelDialog
              draftModel={draftModel}
              onDraftModelChange={onDraftModelChange}
              onSaveModel={onSaveModel}
            />
          )}
        </div>
      </div>
      {refreshStatus ? (
        <div className="rounded-control bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {refreshStatus}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            className={cn(
              fieldClass,
              "pl-8 placeholder:text-muted-foreground/70",
            )}
            placeholder={t("providers.models.searchPlaceholder")}
            value={modelQuery}
            onChange={(event) => setModelQuery(event.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground/70">
          {t("providers.models.showingCount", {
            total: String(selectedModels.length),
            visible: String(visibleModels.length),
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-control border border-border/40 bg-muted">
        {visibleModels.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            {t("providers.models.empty", { provider: draftProvider.name })}
          </div>
        ) : (
          <Table
            className="min-w-[1560px] border-separate border-spacing-0"
            containerClassName="max-h-96"
          >
            <TableHeader className="text-xs font-medium text-muted-foreground">
              <TableRow className="border-border/50">
                <TableHead className="sticky top-0 z-10 w-64 bg-muted px-3 py-1.5">
                  {t("providers.models.title")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.fields.modelRuntime")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.fields.contextLimit")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.fields.outputLimit")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.reasoning")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.input")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.capabilities")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.cost")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.thinking")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.compat")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.defaultModel")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.reasoningEfforts")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5">
                  {t("providers.models.columns.serviceTiers")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted px-3 py-1.5" />
              </TableRow>
            </TableHeader>
            <TableBody className="bg-background">
              {visibleModels.map((model) => (
                <TableRow
                  className="border-border/50 last:border-b-0"
                  key={`${model.providerId}:${model.modelId}`}
                >
                  <TableCell className="px-3 py-2">
                    <div className="truncate font-medium">{model.name}</div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-mono">
                        {model.modelId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-44 max-w-56 truncate px-3 py-2 text-xs text-muted-foreground">
                    {model.api}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <ModelLimit
                      label={t("providers.fields.contextLimit")}
                      value={model.contextLimit}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <ModelLimit
                      label={t("providers.fields.outputLimit")}
                      value={model.outputLimit}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {model.reasoning
                      ? t("providers.models.columns.yes")
                      : t("providers.models.columns.no")}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {getModelInput(model)}
                  </TableCell>
                  <TableCell className="max-w-40 truncate px-3 py-2 text-xs text-muted-foreground">
                    {formatCapabilities(model)}
                  </TableCell>
                  <TableCell className="max-w-48 truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                    {formatModelCost(model.costJson)}
                  </TableCell>
                  <TableCell className="max-w-52 truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                    {formatJsonRecord(model.thinkingLevelMapJson)}
                  </TableCell>
                  <TableCell className="max-w-64 truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                    {formatJsonRecord(model.compatJson)}
                  </TableCell>
                  <TableCell className="max-w-40 truncate px-3 py-2 text-xs text-muted-foreground">
                    {model.isDefault
                      ? t("providers.models.columns.defaultModel")
                      : "-"}
                  </TableCell>
                  <TableCell className="max-w-48 truncate px-3 py-2 text-xs text-muted-foreground">
                    {formatReasoningEfforts(model)}
                  </TableCell>
                  <TableCell className="max-w-40 truncate px-3 py-2 text-xs text-muted-foreground">
                    {formatServiceTiers(model)}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {readOnly ? null : (
                        <ModelParametersDialog
                          model={model}
                          onReload={onReload}
                          onSaveModel={onSaveModel}
                        />
                      )}
                      <Switch
                        aria-label={t("providers.models.toggleFor", {
                          model: model.name,
                        })}
                        checked={model.enabled}
                        disabled={readOnly}
                        onCheckedChange={() =>
                          onSaveModel({ ...model, enabled: !model.enabled })
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
            <SettingsSelect
              ariaLabel={t("providers.fields.modelRuntime")}
              className="w-full min-w-0"
              options={apiOptions}
              value={draftModel.api}
              onChange={(value) =>
                onDraftModelChange({
                  ...draftModel,
                  api: value as ProviderApi,
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

function ModelLimit({
  label,
  value,
}: {
  label: string;
  value?: number | null;
}) {
  return (
    <div className="min-w-0 text-xs">
      <div className="text-muted-foreground/70">{label}</div>
      <div className="mt-0.5 font-mono text-muted-foreground">
        {value ? formatLimit(value) : "-"}
      </div>
    </div>
  );
}

function formatLimit(value: number) {
  return value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);
}

interface ModelParametersDialogProps {
  model: ProviderModelRecord;
  onReload(): Promise<void>;
  onSaveModel(model: ProviderModelRecord): Promise<void>;
}

function ModelParametersDialog({
  model,
  onReload,
  onSaveModel,
}: ModelParametersDialogProps) {
  const { t } = useTranslation("settings");
  const reasoningSwitchId = useId();
  const [contextLimit, setContextLimit] = useState(
    model.contextLimit?.toString() ?? "",
  );
  const [outputLimit, setOutputLimit] = useState(
    model.outputLimit?.toString() ?? "",
  );
  const [isOpen, setIsOpen] = useState(false);
  const [api, setApi] = useState<ProviderApi>(model.api);
  const [capabilities, setCapabilities] = useState<ProviderModelCapability[]>(
    model.capabilities ?? [],
  );
  const [reasoning, setReasoning] = useState(model.reasoning ?? false);
  const [thinkingLevelMapJson, setThinkingLevelMapJson] = useState(
    model.thinkingLevelMapJson ?? "",
  );
  const [costJson, setCostJson] = useState(model.costJson ?? "");
  const [compatJson, setCompatJson] = useState(model.compatJson ?? "");

  function toggleCapability(capability: ProviderModelCapability) {
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    );
  }

  async function saveParameters() {
    await onSaveModel({
      ...model,
      contextLimit: parseLimit(contextLimit),
      outputLimit: parseLimit(outputLimit),
      api,
      capabilities,
      reasoning,
      thinkingLevelMapJson: thinkingLevelMapJson.trim() || null,
      costJson: costJson.trim() || null,
      compatJson: compatJson.trim() || null,
    });
    setIsOpen(false);
  }

  async function deleteModel() {
    await desktopApi.deleteProviderModel(model.providerId, model.modelId);
    await onReload();
    setIsOpen(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          aria-label={t("providers.models.parametersFor", {
            model: model.name,
          })}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <SlidersHorizontal />
        </Button>
      </DialogTrigger>
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>{t("providers.models.parametersTitle")}</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {model.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("providers.fields.modelRuntime")}
            </span>
            <SettingsSelect
              ariaLabel={t("providers.models.runtimeFor", {
                model: model.name,
              })}
              className="w-full min-w-0"
              options={apiOptions}
              value={api}
              onChange={(value) => setApi(value as ProviderApi)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("providers.fields.contextLimit")}
              </span>
              <Input
                className={fieldClass}
                inputMode="numeric"
                placeholder={t("providers.fields.contextLimit")}
                value={contextLimit}
                onChange={(event) => setContextLimit(event.target.value)}
              />
            </Label>
            <Label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("providers.fields.outputLimit")}
              </span>
              <Input
                className={fieldClass}
                inputMode="numeric"
                placeholder={t("providers.fields.outputLimit")}
                value={outputLimit}
                onChange={(event) => setOutputLimit(event.target.value)}
              />
            </Label>
          </div>

          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("providers.fields.capabilities")}
            </span>
            <div className="flex flex-wrap gap-3">
              {modelCapabilities.map((capability) => (
                <Label
                  className="flex items-center gap-2 text-sm"
                  key={capability}
                >
                  <Checkbox
                    checked={capabilities.includes(capability)}
                    onCheckedChange={() => toggleCapability(capability)}
                  />
                  {t(`providers.fields.capability.${capability}`)}
                </Label>
              ))}
            </div>
          </div>

          <Label
            className="flex items-center gap-2 text-sm"
            htmlFor={reasoningSwitchId}
          >
            <Switch
              checked={reasoning}
              id={reasoningSwitchId}
              onCheckedChange={(checked) => setReasoning(checked === true)}
            />
            {t("providers.fields.reasoning")}
          </Label>

          <Label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("providers.fields.thinkingLevelMapJson")}
            </span>
            <Textarea
              className={textareaClass}
              placeholder={t("providers.fields.thinkingLevelMapJson")}
              value={thinkingLevelMapJson}
              onChange={(event) => setThinkingLevelMapJson(event.target.value)}
            />
          </Label>

          <Label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("providers.fields.costJson")}
            </span>
            <Textarea
              className={textareaClass}
              placeholder={t("providers.fields.costJson")}
              value={costJson}
              onChange={(event) => setCostJson(event.target.value)}
            />
          </Label>

          <Label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("providers.fields.modelCompatJson")}
            </span>
            <Textarea
              className={textareaClass}
              placeholder={t("providers.fields.modelCompatJson")}
              value={compatJson}
              onChange={(event) => setCompatJson(event.target.value)}
            />
          </Label>
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="text-muted-foreground hover:text-destructive"
            type="button"
            variant="ghost"
            onClick={deleteModel}
          >
            <Trash2 />
            {t("providers.actions.delete")}
          </Button>
          <Button type="button" variant="secondary" onClick={saveParameters}>
            {t("providers.actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
