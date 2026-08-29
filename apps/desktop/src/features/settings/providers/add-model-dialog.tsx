import {
  type ProviderApi,
  type ProviderModelRecord,
  providerApis,
} from "@cocurdex/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
} from "@/components/ui";
import { SettingsSelect } from "../settings-select";

const fieldClass =
  "h-8 min-w-0 rounded-control border-border/70 bg-background/60 text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20";

const apiOptions = providerApis.map((api) => ({
  label: api,
  value: api,
}));

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

interface AddModelDialogProps {
  providerId: string;
  onSaveModel(model: ProviderModelRecord): Promise<void>;
}

export function AddModelDialog({
  providerId,
  onSaveModel,
}: AddModelDialogProps) {
  const { t } = useTranslation("settings");
  const [isOpen, setIsOpen] = useState(false);

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
        {/* Form state lives inside the content, which Radix unmounts on
            close, so a cancelled draft never leaks into the next open. */}
        <AddModelForm
          providerId={providerId}
          onSaveModel={async (model) => {
            await onSaveModel(model);
            setIsOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddModelForm({ providerId, onSaveModel }: AddModelDialogProps) {
  const { t } = useTranslation("settings");
  const [draftModel, setDraftModel] = useState<ProviderModelRecord>(() =>
    createEmptyModel(providerId),
  );

  return (
    <>
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
              setDraftModel({ ...draftModel, modelId: event.target.value })
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
              setDraftModel({ ...draftModel, name: event.target.value })
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
              setDraftModel({ ...draftModel, api: value as ProviderApi })
            }
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          disabled={!draftModel.modelId.trim()}
          type="button"
          variant="secondary"
          onClick={() => void onSaveModel(draftModel)}
        >
          {t("providers.models.addTitle")}
        </Button>
      </DialogFooter>
    </>
  );
}
