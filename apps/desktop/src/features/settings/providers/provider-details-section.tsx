import type { ProviderConfigRecord } from "@cocurdex/shared";
import { Check, KeyRound, Trash2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppConfirmDialog } from "@/components";
import { Button, Input, Label, Switch, Text } from "@/components/ui";
import { cn } from "@/lib";

const fieldClass =
  "h-8 min-w-0 rounded-control border-border/70 bg-background/60 text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20";

function FieldCaption({ children }: { children: ReactNode }) {
  return (
    <Text size="meta" tone="muted" weight="medium">
      {children}
    </Text>
  );
}

interface ProviderDetailsSectionProps {
  apiKey: string;
  draftProvider: ProviderConfigRecord;
  managedAuth?: boolean;
  presetProviderIds: Set<string>;
  selectedProvider?: ProviderConfigRecord;
  onApiKeyChange(apiKey: string): void;
  onClearApiKey(): Promise<void>;
  onDraftProviderChange(provider: ProviderConfigRecord): void;
  onEnabledChange(enabled: boolean): void;
  onRemoveProvider(providerId: string): Promise<void>;
  onSaveProvider(): Promise<void>;
}

export function ProviderDetailsSection({
  apiKey,
  draftProvider,
  managedAuth = false,
  presetProviderIds,
  selectedProvider,
  onApiKeyChange,
  onClearApiKey,
  onDraftProviderChange,
  onEnabledChange,
  onRemoveProvider,
  onSaveProvider,
}: ProviderDetailsSectionProps) {
  const { t } = useTranslation("settings");
  const enabledSwitchId = useId();
  const apiKeyId = useId();
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const hasStoredApiKey = Boolean(draftProvider.apiKeySecretId);
  const isPresetProvider = presetProviderIds.has(draftProvider.id);
  // The provider id is the primary key: models and the API key secret are
  // keyed by it, so renaming an existing provider would orphan them. The id
  // is only editable while creating a new provider.
  const isIdLocked = isPresetProvider || Boolean(selectedProvider);

  return (
    <>
      <div className="grid gap-4 py-4">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <Text size="body" weight="semibold">
            {t("providers.sections.provider")}
          </Text>
          <Label
            className="flex shrink-0 items-center gap-2"
            htmlFor={enabledSwitchId}
          >
            <Text size="body">{t("providers.state.enabled")}</Text>
            <Switch
              checked={draftProvider.enabled}
              id={enabledSwitchId}
              onCheckedChange={onEnabledChange}
            />
          </Label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Label className="grid gap-1.5">
            <FieldCaption>{t("providers.fields.providerId")}</FieldCaption>
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
            <FieldCaption>{t("providers.fields.displayName")}</FieldCaption>
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
          <FieldCaption>{t("providers.fields.baseUrl")}</FieldCaption>
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
        {!managedAuth ? (
          <div className="grid gap-1.5">
            <Label htmlFor={apiKeyId}>
              <FieldCaption>{t("providers.fields.apiKey")}</FieldCaption>
              <Text size="meta" tone="subtle">
                {hasStoredApiKey
                  ? t("providers.state.configured")
                  : t("providers.state.notConfigured")}
              </Text>
            </Label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className={cn(fieldClass, "min-w-0 flex-1")}
                id={apiKeyId}
                placeholder={
                  hasStoredApiKey ? t("providers.fields.newApiKey") : undefined
                }
                type="password"
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
              />
              {hasStoredApiKey ? (
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
        ) : null}
        {!isPresetProvider ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {selectedProvider ? (
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
        ) : null}
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
