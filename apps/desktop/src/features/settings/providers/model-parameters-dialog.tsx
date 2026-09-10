import type {
  ProviderApi,
  ProviderModelCapability,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { ChevronRight, SlidersHorizontal, Trash2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
  Text,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { cn, desktopApi } from "@/lib";
import { ModelRuntimeSelect } from "./model-runtime-select";

const fieldClass =
  "h-8 min-w-0 rounded-control border-border/70 bg-background/60 text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20";
const textareaClass =
  "min-h-20 min-w-0 rounded-control border-border/70 bg-background/60 font-mono text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20";
const modelCapabilities: ProviderModelCapability[] = [
  "agent",
  "chat",
  "vision",
  "reasoning",
];
const costKeys = ["input", "output", "cacheRead", "cacheWrite"] as const;

type CostKey = (typeof costKeys)[number];
type CostDraft = Record<CostKey, string>;

function emptyCostDraft(): CostDraft {
  return { input: "", output: "", cacheRead: "", cacheWrite: "" };
}

function parseCostDraft(json?: string | null): CostDraft {
  const draft = emptyCostDraft();
  if (!json?.trim()) {
    return draft;
  }

  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return draft;
    }

    const record = parsed as Record<string, unknown>;
    for (const key of costKeys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        draft[key] = String(value);
      }
    }
    return draft;
  } catch {
    return draft;
  }
}

function serializeCostDraft(draft: CostDraft): string | null {
  const cost: Record<string, number> = {};
  for (const key of costKeys) {
    const trimmed = draft[key].trim();
    if (!trimmed) {
      continue;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      cost[key] = parsed;
    }
  }

  return Object.keys(cost).length > 0 ? JSON.stringify(cost) : null;
}

function parseLimit(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isCapability(value: string): value is ProviderModelCapability {
  return modelCapabilities.includes(value as ProviderModelCapability);
}

function FieldCaption({ children }: { children: ReactNode }) {
  return (
    <Text size="meta" tone="muted" weight="medium">
      {children}
    </Text>
  );
}

interface ModelParametersDialogProps {
  model: ProviderModelRecord;
  readOnly?: boolean;
  onReload(): Promise<void>;
  onSaveModel(model: ProviderModelRecord): Promise<void>;
}

export function ModelParametersDialog({
  model,
  readOnly = false,
  onReload,
  onSaveModel,
}: ModelParametersDialogProps) {
  const { t } = useTranslation("settings");
  const [isOpen, setIsOpen] = useState(false);

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
        {isOpen ? (
          <ModelParametersForm
            model={model}
            readOnly={readOnly}
            onClose={() => setIsOpen(false)}
            onReload={onReload}
            onSaveModel={onSaveModel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModelParametersForm({
  model,
  readOnly,
  onClose,
  onReload,
  onSaveModel,
}: {
  model: ProviderModelRecord;
  readOnly: boolean;
  onClose(): void;
  onReload(): Promise<void>;
  onSaveModel(model: ProviderModelRecord): Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const reasoningSwitchId = useId();
  const [contextLimit, setContextLimit] = useState(
    model.contextLimit?.toString() ?? "",
  );
  const [outputLimit, setOutputLimit] = useState(
    model.outputLimit?.toString() ?? "",
  );
  const [api, setApi] = useState<ProviderApi>(model.api);
  const [capabilities, setCapabilities] = useState<ProviderModelCapability[]>(
    model.capabilities ?? [],
  );
  const [reasoning, setReasoning] = useState(model.reasoning ?? false);
  const [costDraft, setCostDraft] = useState(() =>
    parseCostDraft(model.costJson),
  );
  const [thinkingLevelMapJson, setThinkingLevelMapJson] = useState(
    model.thinkingLevelMapJson ?? "",
  );
  const [compatJson, setCompatJson] = useState(model.compatJson ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(model.thinkingLevelMapJson?.trim() || model.compatJson?.trim()),
  );

  async function saveParameters() {
    await onSaveModel({
      ...model,
      contextLimit: parseLimit(contextLimit),
      outputLimit: parseLimit(outputLimit),
      api,
      capabilities,
      reasoning,
      thinkingLevelMapJson: thinkingLevelMapJson.trim() || null,
      costJson: serializeCostDraft(costDraft),
      compatJson: compatJson.trim() || null,
    });
    onClose();
  }

  async function deleteModel() {
    await desktopApi.deleteProviderModel(model.providerId, model.modelId);
    await onReload();
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("providers.models.parametersTitle")}</DialogTitle>
        <DialogDescription className="truncate">
          {model.name}
          {model.modelId !== model.name ? (
            <span className="ms-2 font-mono text-meta">{model.modelId}</span>
          ) : null}
        </DialogDescription>
      </DialogHeader>

      <div className="grid max-h-[min(70vh,36rem)] gap-4 overflow-y-auto pe-1">
        <div className="grid gap-1.5">
          <FieldCaption>{t("providers.fields.modelRuntime")}</FieldCaption>
          <ModelRuntimeSelect
            ariaLabel={t("providers.models.runtimeFor", {
              model: model.name,
            })}
            disabled={readOnly}
            value={api}
            onChange={setApi}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Label className="grid gap-1.5">
            <FieldCaption>{t("providers.fields.contextLimit")}</FieldCaption>
            <Input
              className={fieldClass}
              disabled={readOnly}
              inputMode="numeric"
              value={contextLimit}
              onChange={(event) => setContextLimit(event.target.value)}
            />
          </Label>
          <Label className="grid gap-1.5">
            <FieldCaption>{t("providers.fields.outputLimit")}</FieldCaption>
            <Input
              className={fieldClass}
              disabled={readOnly}
              inputMode="numeric"
              value={outputLimit}
              onChange={(event) => setOutputLimit(event.target.value)}
            />
          </Label>
        </div>

        <div className="grid gap-1.5">
          <FieldCaption>{t("providers.fields.capabilities")}</FieldCaption>
          <ToggleGroup
            aria-label={t("providers.fields.capabilities")}
            className="flex w-full flex-wrap"
            disabled={readOnly}
            size="sm"
            spacing={1}
            type="multiple"
            value={capabilities}
            variant="outline"
            onValueChange={(next) => setCapabilities(next.filter(isCapability))}
          >
            {modelCapabilities.map((capability) => (
              <ToggleGroupItem key={capability} value={capability}>
                {t(`providers.fields.capability.${capability}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex h-8 items-center justify-between gap-3">
          <Label htmlFor={reasoningSwitchId}>
            <FieldCaption>{t("providers.fields.reasoning")}</FieldCaption>
          </Label>
          <Switch
            checked={reasoning}
            disabled={readOnly}
            id={reasoningSwitchId}
            onCheckedChange={(checked) => setReasoning(checked === true)}
          />
        </div>

        <div className="grid gap-1.5">
          <FieldCaption>{t("providers.fields.cost.title")}</FieldCaption>
          <div className="grid gap-3 sm:grid-cols-2">
            {costKeys.map((key) => (
              <Label className="grid gap-1.5" key={key}>
                <Text size="meta" tone="subtle">
                  {t(`providers.fields.cost.${key}`)}
                </Text>
                <Input
                  className={fieldClass}
                  disabled={readOnly}
                  inputMode="decimal"
                  value={costDraft[key]}
                  onChange={(event) =>
                    setCostDraft((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </Label>
            ))}
          </div>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger
            className="flex h-8 items-center gap-1.5 text-start text-muted-foreground hover:text-foreground"
            type="button"
          >
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                advancedOpen && "rotate-90",
              )}
            />
            <FieldCaption>{t("providers.models.advanced")}</FieldCaption>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 pt-1">
            <Label className="grid gap-1.5">
              <span className="grid gap-0.5">
                <FieldCaption>
                  {t("providers.fields.thinkingLevelMap")}
                </FieldCaption>
                <Text size="meta" tone="subtle">
                  {t("providers.fields.thinkingLevelMapHint")}
                </Text>
              </span>
              <Textarea
                className={textareaClass}
                disabled={readOnly}
                value={thinkingLevelMapJson}
                onChange={(event) =>
                  setThinkingLevelMapJson(event.target.value)
                }
              />
            </Label>
            <Label className="grid gap-1.5">
              <span className="grid gap-0.5">
                <FieldCaption>{t("providers.fields.modelCompat")}</FieldCaption>
                <Text size="meta" tone="subtle">
                  {t("providers.fields.modelCompatHint")}
                </Text>
              </span>
              <Textarea
                className={textareaClass}
                disabled={readOnly}
                value={compatJson}
                onChange={(event) => setCompatJson(event.target.value)}
              />
            </Label>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {readOnly ? null : (
        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              className="text-muted-foreground hover:text-destructive"
              type="button"
              variant="ghost"
              onClick={deleteModel}
            >
              <Trash2 className="size-4" />
              {t("providers.actions.delete")}
            </Button>
            <Button type="button" variant="secondary" onClick={saveParameters}>
              {t("providers.actions.save")}
            </Button>
          </div>
        </DialogFooter>
      )}
    </>
  );
}
