import { ClipboardPaste, FileUp } from "lucide-react";
import { type RefObject, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import { cn } from "@/lib";
import {
  type JsonTextHandler,
  useFileDropTarget,
  useJsonFileImport,
} from "./json-file-import";
import { JsonPasteDialog } from "./json-paste-dialog";

interface JsonImportDropzoneProps {
  label: string;
  intro: string;
  title: string;
  dropHint: string;
  dropActiveHint: string;
  invalidFileMessage: string;
  pasteTitle: string;
  pasteDescription: string;
  onText: JsonTextHandler;
}

export function JsonImportDropzone({
  label,
  intro,
  title,
  dropHint,
  dropActiveHint,
  invalidFileMessage,
  pasteTitle,
  pasteDescription,
  onText,
}: JsonImportDropzoneProps) {
  const { t } = useTranslation("settings");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const { importFile, importFiles } = useJsonFileImport({
    invalidFileMessage,
    onText,
  });
  const { isDraggingFile, dropHandlers } = useFileDropTarget(importFiles);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text size="sm" weight="medium">
            {label}
          </Text>
          <Text size="2xs" tone="muted">
            {intro}
          </Text>
        </div>
        <Button
          className="shrink-0"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setIsPasteOpen(true)}
        >
          <ClipboardPaste className="size-4" />
          {t("jsonImport.pasteButton")}
        </Button>
      </div>
      <button
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border/60 px-6 py-6 text-center transition-colors hover:bg-muted/45 hover:text-foreground focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none",
          isDraggingFile && "border-primary/40 bg-primary/10",
        )}
        type="button"
        onClick={() => fileInputRef.current?.click()}
        {...dropHandlers}
      >
        <FileUp className="size-5 text-muted-foreground" />
        <Text size="sm" weight="medium">
          {title}
        </Text>
        <Text size="xs" tone="muted">
          {isDraggingFile ? dropActiveHint : dropHint}
        </Text>
      </button>
      <JsonFileInput inputRef={fileInputRef} onFile={importFile} />
      <JsonPasteDialog
        description={pasteDescription}
        open={isPasteOpen}
        title={pasteTitle}
        onOpenChange={setIsPasteOpen}
        onText={onText}
      />
    </div>
  );
}

export function JsonFileInput({
  inputRef,
  onFile,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile(file: File | undefined): Promise<void>;
}) {
  return (
    <input
      accept=".json,application/json,text/plain"
      aria-hidden="true"
      className="sr-only"
      ref={inputRef}
      tabIndex={-1}
      type="file"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        void onFile(file);
      }}
    />
  );
}
