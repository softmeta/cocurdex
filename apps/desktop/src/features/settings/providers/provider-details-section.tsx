import type { ProviderConfigRecord } from "@cocurdex/shared";
import { Check, KeyRound, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppConfirmDialog } from "@/components";
import { Badge, Button, Checkbox, Input, Label } from "@/components/ui";
import { cn } from "@/lib";

const fieldClass =
  "h-8 min-w-0 rounded-control border-border/70 bg-background/60 text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20";
const labelClass = "text-xs font-medium text-muted-foreground";

interface ProviderDetailsSectionProps {
  apiKey: string;
  draftProvider: ProviderConfigRecord;
  presetProviderIds: Set<string>;
  selectedProvider?: ProviderConfigRecord;
  onApiKeyChange(apiKey: string): void;
  onClearApiKey(): Promise<void>;
  onDraftProviderChange(provider: ProviderConfigRecord): void;
  onRemoveProvider(providerId: string): Promise<void>;
  onSaveProvider(): Promise<void>;
}

export function ProviderDetailsSection({
  apiKey,
  draftProvider,
  presetProviderIds,
  selectedProvider,
  onApiKeyChange,
  onClearApiKey,
  onDraftProviderChange,
  onRemoveProvider,
  onSaveProvider,
}: ProviderDetailsSectionProps) {
  const { t } = useTranslation("settings");
  const enabledCheckboxId = useId();
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const isPresetProvider = presetProviderIds.has(draftProvider.id);
  // The provider id is the primary key: models and the API key secret are
  // keyed by it, so renaming an existing provider would orphan them. The id
  // is only editable while creating a new provider.
  const isIdLocked = isPresetProvider || Boolean(selectedProvider);

  return (
    <>
      <div className="grid gap-4 py-4">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            {t("providers.sections.provider")}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Label className="grid gap-1.5">
            <span className={labelClass}>
              {t("providers.fields.providerId")}
            </span>
            <Input
              className={fieldClass}
              disabled={isIdLocked}
              placeholder={t("providers.fields.providerId")}
              value={draftProvider.id}
              onChange={(event) =>
                onDraftProviderChange({
                  ...draftProvider,
                  id: event.target.value,
                })
              }
            />
          </Label>
          <Label className="grid gap-1.5">
            <span className={labelClass}>
              {t("providers.fields.displayName")}
            </span>
            <Input
              className={fieldClass}
              disabled={isPresetProvider}
              placeholder={t("providers.fields.displayName")}
              value={draftProvider.name}
              onChange={(event) =>
                onDraftProviderChange({
                  ...draftProvider,
                  name: event.target.value,
                })
              }
            />
          </Label>
        </div>
        <Label className="grid gap-1.5">
          <span className={labelClass}>{t("providers.fields.baseUrl")}</span>
          <Input
            className={fieldClass}
            disabled={isPresetProvider}
            placeholder="e.g. https://api.openai.com/v1"
            value={draftProvider.baseUrl}
            onChange={(event) =>
              onDraftProviderChange({
                ...draftProvider,
                baseUrl: event.target.value,
              })
            }
          />
        </Label>
        <Label
          className="flex items-center gap-2 text-sm"
          htmlFor={enabledCheckboxId}
        >
          <Checkbox
            checked={draftProvider.enabled}
            id={enabledCheckboxId}
            onCheckedChange={(checked) =>
              onDraftProviderChange({
                ...draftProvider,
                enabled: checked === true,
              })
            }
          />
          {t("providers.state.enabled")}
        </Label>
      </div>

      <div className="grid gap-4 py-4">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            {t("providers.sections.auth")}
          </div>
          <Badge className="shrink-0" variant="outline">
            {draftProvider.apiKeySecretId
              ? t("providers.state.configured")
              : t("providers.state.notConfigured")}
          </Badge>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            className={cn(fieldClass, "min-w-0 flex-1")}
            placeholder={t("providers.fields.newApiKey")}
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
          {draftProvider.apiKeySecretId ? (
            <Button
              className="shrink-0"
              type="button"
              variant="ghost"
              onClick={onClearApiKey}
            >
              <KeyRound className="size-4" />
              {t("providers.actions.clearKey")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-border/60 border-t pt-4">
        {selectedProvider && !presetProviderIds.has(selectedProvider.id) ? (
          <Button
            className="text-muted-foreground hover:text-destructive"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setIsDeleteConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            {t("providers.actions.delete")}
          </Button>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          type="button"
          variant="secondary"
          onClick={onSaveProvider}
        >
          <Check className="size-4" />
          {t("providers.actions.save")}
        </Button>
      </div>

      <AppConfirmDialog
        open={isDeleteConfirmOpen}
        variant="destructive"
        title={t("providers.deleteConfirm.title")}
        description={t("providers.deleteConfirm.description", {
          provider: selectedProvider?.name ?? draftProvider.id,
        })}
        cancelLabel={t("providers.deleteConfirm.cancel")}
        confirmLabel={t("providers.deleteConfirm.confirm")}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={() => {
          if (selectedProvider) {
            void onRemoveProvider(selectedProvider.id);
          }
          setIsDeleteConfirmOpen(false);
        }}
      />
    </>
  );
}
