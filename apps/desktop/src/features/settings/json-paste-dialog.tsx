import { useState } from "react";
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
  Textarea,
} from "@/components/ui";
import type { JsonTextHandler } from "./json-file-import";

export function JsonPasteDialog({
  open,
  title,
  description,
  onOpenChange,
  onText,
}: {
  open: boolean;
  title: string;
  description: string;
  onOpenChange(open: boolean): void;
  onText: JsonTextHandler;
}) {
  const { t } = useTranslation("settings");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    const nextError = await onText(text);
    if (nextError) {
      setError(nextError);
      return;
    }
    setText("");
    setError("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setError("");
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-2">
          <Textarea
            aria-invalid={Boolean(error)}
            aria-label={t("jsonImport.pasteLabel")}
            className="min-h-48 resize-y rounded-control border-border/70 bg-background/60 font-mono text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20"
            placeholder={t("jsonImport.pastePlaceholder")}
            spellCheck={false}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
          />
          {error ? (
            <Text role="alert" size="meta" tone="destructive">
              {error}
            </Text>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("jsonImport.cancel")}
          </Button>
          <Button
            disabled={!text.trim()}
            type="button"
            onClick={() => void submit()}
          >
            {t("jsonImport.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
