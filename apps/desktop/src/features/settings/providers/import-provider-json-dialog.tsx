import { FileUp } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
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
import { cn } from "@/lib";
import {
  isJsonImportFile,
  type ParsedProviderImport,
  type ProviderImportWarning,
  parseProviderJson,
} from "./parse-provider-json";

function dataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }
  return Array.from(dataTransfer.types).includes("Files");
}

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
  const dragDepthRef = useRef(0);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

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

  function resetDragState() {
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
  }

  function handleDragEnter(event: DragEvent<HTMLButtonElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFile(false);
    }
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    resetDragState();
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files);
    const file =
      files.find((candidate) => isJsonImportFile(candidate)) ?? files[0];
    void handleFileChange(file);
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

  const dropZoneHint = isDraggingFile
    ? t("providers.importJson.dropActive")
    : t("providers.importJson.dropHint");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text size="sm" weight="medium">
          {t("providers.importJson.label")}
        </Text>
        <Text size="2xs" tone="muted">
          {t("providers.importJson.intro")}
        </Text>
      </div>
      <button
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border/60 px-6 py-6 text-center transition-colors hover:bg-muted/45 hover:text-foreground focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none",
          isDraggingFile && "border-primary/40 bg-primary/10",
        )}
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <FileUp className="size-5 text-muted-foreground" />
        <Text size="sm" weight="medium">
          {t("providers.importJson.title")}
        </Text>
        <Text size="xs" tone="muted">
          {dropZoneHint}
        </Text>
      </button>
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
    </div>
  );
}
