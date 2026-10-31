import type { McpConfigFile } from "@cocurdex/shared";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Spinner, Text, Textarea } from "@/components/ui";
import { desktopApi } from "@/lib";

function jsonSyntaxError(text: string) {
  try {
    JSON.parse(text);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function McpJsonEditor({
  file,
  onSaved,
}: {
  file: McpConfigFile;
  onSaved(file: McpConfigFile): void;
}) {
  const { t } = useTranslation("settings");
  const [text, setText] = useState(file.content);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const syntaxError = jsonSyntaxError(text);
  const error = syntaxError || saveError;
  const isDirty = text !== file.content;

  const save = async () => {
    setIsSaving(true);
    try {
      onSaved(await desktopApi.saveMcpConfig(text));
    } catch (nextError) {
      setSaveError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Textarea
        aria-invalid={Boolean(error)}
        aria-label={t("mcp.json.label")}
        className="min-h-96 flex-1 resize-none rounded-card border-border/70 bg-settings-surface font-mono text-body leading-6 focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSaveError("");
        }}
      />
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Text role="alert" size="meta" tone="destructive">
          {error}
        </Text>
        <Button
          className="shrink-0"
          disabled={isSaving || !isDirty || Boolean(syntaxError)}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => void save()}
        >
          {isSaving ? <Spinner size="sm" /> : <Check className="size-4" />}
          {t("mcp.actions.save")}
        </Button>
      </div>
    </div>
  );
}
