import {
  type ParsedProviderImport,
  type ProviderImportWarning,
  parseProviderJson,
} from "@cocurdex/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
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
import type { JsonTextHandler } from "../json-file-import";
import { providerImportWarningMessage } from "./import-warning-message";

interface ProviderJsonImportProps {
  onImport(json: string): Promise<void>;
  children(onText: JsonTextHandler): ReactNode;
}

interface ImportPreview {
  json: string;
  providers: ParsedProviderImport[];
  warnings: ProviderImportWarning[];
}

export function ProviderJsonImport({
  onImport,
  children,
}: ProviderJsonImportProps) {
  const { t } = useTranslation("settings");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const modelCount = preview
    ? preview.providers.reduce((total, entry) => total + entry.models.length, 0)
    : 0;

  function closePreview() {
    setPreview(null);
    setError("");
    setIsImporting(false);
  }

  function handleText(json: string) {
    const parsed = parseProviderJson(json);
    if (!parsed.ok) {
      return parsed.error;
    }
    setError("");
    setPreview({
      json,
      providers: parsed.providers,
      warnings: parsed.warnings,
    });
    return null;
  }

  async function handleConfirm() {
    if (!preview) {
      return;
    }

    setError("");
    setIsImporting(true);
    try {
      await onImport(preview.json);
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
      {children(handleText)}
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
                        {providerImportWarningMessage(t, warning)}
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
