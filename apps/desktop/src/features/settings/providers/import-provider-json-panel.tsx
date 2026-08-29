import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text, Textarea } from "@/components/ui";
import {
  type ParsedProviderImport,
  parseProviderJson,
} from "./parse-provider-json";

const PLACEHOLDER = `{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" }
      ]
    }
  }
}`;

interface ImportProviderJsonPanelProps {
  onImport(providers: ParsedProviderImport[]): Promise<void>;
}

export function ImportProviderJsonPanel({
  onImport,
}: ImportProviderJsonPanelProps) {
  const { t } = useTranslation("settings");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  async function handleImport() {
    const parsed = parseProviderJson(jsonText);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setError("");
    setIsImporting(true);
    try {
      await onImport(parsed.providers);
      setJsonText("");
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : t("providers.status.importFailed");
      setError(message);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4">
      <Text className="shrink-0 text-muted-foreground" size="body">
        {t("providers.importJson.description")}
      </Text>

      <Textarea
        aria-invalid={Boolean(error)}
        aria-label={t("providers.importJson.title")}
        className="max-h-[min(24rem,50vh)] min-h-48 resize-y overflow-y-auto font-mono text-body leading-6"
        placeholder={PLACEHOLDER}
        spellCheck={false}
        value={jsonText}
        onChange={(event) => {
          setJsonText(event.target.value);
          if (error) {
            setError("");
          }
        }}
      />

      {error ? (
        <p className="shrink-0 text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          disabled={!jsonText.trim() || isImporting}
          type="button"
          onClick={() => void handleImport()}
        >
          {isImporting
            ? t("providers.importJson.importing")
            : t("providers.importJson.confirm")}
        </Button>
      </div>
    </div>
  );
}
