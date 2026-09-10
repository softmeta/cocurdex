import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@/components/ui";
import {
  isJsonImportFile,
  type ParsedProviderImport,
  type ProviderImportWarning,
  parseProviderJson,
} from "./parse-provider-json";

interface ImportProviderJsonDialogProps {
  onImport(providers: ParsedProviderImport[]): Promise<void>;
}

interface ImportPreview {
  providers: ParsedProviderImport[];
  warnings: ProviderImportWarning[];
}

export function ImportProviderJsonDialog({
  onImport,
}: ImportProviderJsonDialogProps) {
  const { t } = useTranslation("settings");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileSelectionRef = useRef(0);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const modelCount = preview
    ? preview.providers.reduce((total, entry) => total + entry.models.length, 0)
    : 0;

  function warningMessage(warning: ProviderImportWarning): string {
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
    return messageByCode[warning.code];
  }

  function closePreview() {
    fileSelectionRef.current += 1;
    setPreview(null);
    setError("");
    setIsImporting(false);
  }

  async function handleFileChange(file: File | undefined) {
    if (!file) {
      return;
    }

    const selection = fileSelectionRef.current + 1;
    fileSelectionRef.current = selection;
    if (!isJsonImportFile(file)) {
      toast.error(t("providers.importJson.invalidFile"));
      return;
    }

    const parsed = parseProviderJson(await file.text());
    if (selection !== fileSelectionRef.current) {
      return;
    }
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    setError("");
    setPreview({
      providers: parsed.providers,
      warnings: parsed.warnings,
    });
  }

  async function handleConfirm() {
    if (!preview) {
      return;
    }

    setError("");
    setIsImporting(true);
    try {
      await onImport(preview.providers);
      closePreview();
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : t("providers.status.importFailed");
      setError(message);
      setIsImporting(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        type="button"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
      >
        <FileUp className="size-4" />
        {t("providers.actions.importJson")}
      </Button>
      <input
        accept=".json,application/json,text/plain"
        aria-hidden="true"
        className="sr-only"
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void handleFileChange(file);
        }}
      />
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !isImporting) {
            closePreview();
          }
        }}
      >
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>{t("providers.importJson.title")}</DialogTitle>
            <DialogDescription>
              {t("providers.importJson.description")}
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <div className="flex max-h-[min(24rem,50vh)] min-w-0 flex-col gap-2 overflow-y-auto">
              <Text size="body" weight="medium">
                {t("providers.importJson.summary", {
                  providers: t("providers.importJson.providerCount", {
                    count: preview.providers.length,
                  }),
                  models: t("providers.models.modelCount", {
                    count: modelCount,
                  }),
                })}
              </Text>
              <ul className="flex flex-col gap-1">
                {preview.providers.map((entry) => (
                  <li key={entry.provider.id}>
                    <Text size="meta" tone="muted">
                      {`${entry.provider.name} · ${t(
                        "providers.models.modelCount",
                        {
                          count: entry.models.length,
                        },
                      )}`}
                    </Text>
                  </li>
                ))}
              </ul>
              {preview.warnings.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {preview.warnings.map((warning) => (
                    <li key={`${warning.code}:${warning.providerId}`}>
                      <Text size="meta" tone="muted">
                        {warningMessage(warning)}
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="text-body text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              disabled={isImporting}
              type="button"
              variant="outline"
              onClick={closePreview}
            >
              {t("providers.importJson.cancel")}
            </Button>
            <Button
              disabled={!preview || isImporting}
              type="button"
              onClick={() => void handleConfirm()}
            >
              {isImporting
                ? t("providers.importJson.importing")
                : t("providers.importJson.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
