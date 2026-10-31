import {
  ChevronDown,
  ClipboardPaste,
  FileUp,
  PenLine,
  Plus,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import { type JsonTextHandler, useJsonFileImport } from "./json-file-import";
import { JsonFileInput } from "./json-import-dropzone";
import { JsonPasteDialog } from "./json-paste-dialog";

export interface JsonImportMessages {
  invalidFile: string;
  pasteTitle: string;
  pasteDescription: string;
}

export function JsonAddMenu({
  label,
  variant,
  messages,
  extraItems,
  onAddManually,
  onText,
}: {
  label: string;
  variant: "default" | "outline" | "secondary";
  messages: JsonImportMessages;
  extraItems?: ReactNode;
  onAddManually(): void;
  onText: JsonTextHandler;
}) {
  const { t } = useTranslation("settings");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const { importFile } = useJsonFileImport({
    invalidFileMessage: messages.invalidFile,
    onText,
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="shrink-0" type="button" variant={variant}>
              <Plus className="size-4" />
              {label}
              <ChevronDown className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onClick={onAddManually}>
            <PenLine className="size-3.5" />
            {t("jsonImport.addManually")}
          </DropdownMenuItem>
          {extraItems}
          <DropdownMenuItem onClick={() => setIsPasteOpen(true)}>
            <ClipboardPaste className="size-3.5" />
            {t("jsonImport.pasteButton")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <FileUp className="size-3.5" />
            {t("jsonImport.chooseFile")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <JsonFileInput inputRef={fileInputRef} onFile={importFile} />
      <JsonPasteDialog
        description={messages.pasteDescription}
        open={isPasteOpen}
        title={messages.pasteTitle}
        onOpenChange={setIsPasteOpen}
        onText={onText}
      />
    </>
  );
}
