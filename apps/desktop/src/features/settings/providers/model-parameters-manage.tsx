import type { ProviderModelRecord } from "@cocurdex/shared";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppRemoveButton } from "@/components";
import { Button, Label } from "@/components/ui";
import { desktopApi } from "@/lib";

interface ModelParametersManageProps {
  builtIn: boolean;
  model: ProviderModelRecord;
  onClose(): void;
  onReload(): Promise<void>;
}

export function ModelParametersManage({
  builtIn,
  model,
  onClose,
  onReload,
}: ModelParametersManageProps) {
  const { t } = useTranslation("settings");

  async function finish() {
    await onReload();
    onClose();
  }

  async function resetModel() {
    await desktopApi.resetProviderModel(model.providerId, model.modelId);
    await finish();
  }

  async function deleteModel() {
    await desktopApi.deleteProviderModel(model.providerId, model.modelId);
    await finish();
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Label>{t("providers.manageLabel")}</Label>
      {builtIn && model.source !== "manual" ? (
        <Button
          className="-ms-2.5 text-muted-foreground"
          disabled={!model.overridden}
          size="sm"
          type="button"
          variant="ghost"
          onClick={resetModel}
        >
          <RotateCcw className="size-3.5" />
          {t("providers.actions.resetToDefault")}
        </Button>
      ) : (
        <AppRemoveButton
          cancelLabel={t("providers.deleteConfirm.cancel")}
          confirmDescription={t("providers.models.deleteConfirmDescription", {
            model: model.name,
          })}
          confirmLabel={t("providers.deleteConfirm.confirm")}
          confirmTitle={t("providers.models.deleteConfirmTitle")}
          label={t("providers.actions.delete")}
          onConfirm={() => void deleteModel()}
        />
      )}
    </div>
  );
}
