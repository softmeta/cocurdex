import { Braces, FolderOpen, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import { desktopApi } from "@/lib";

export type McpEditorMode = "form" | "json";

export function McpSettingsHeader({
  configPath,
  errors,
  mode,
  onModeChange,
}: {
  configPath: string;
  errors: string[];
  mode: McpEditorMode;
  onModeChange(mode: McpEditorMode): void;
}) {
  const { t } = useTranslation("settings");
  const isJson = mode === "json";
  const canReveal = isJson && desktopApi.capabilities.fileManager;

  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-1.5">
          <Text size="body" tone="muted">
            {isJson ? t("mcp.jsonDescription") : t("mcp.description")}
          </Text>
          {isJson && !canReveal ? null : (
            <Text aria-hidden size="body" tone="muted">
              ·
            </Text>
          )}
          {isJson ? null : (
            <Button
              className="text-muted-foreground"
              size="xs"
              title={configPath}
              type="button"
              variant="ghost"
              onClick={() => onModeChange("json")}
            >
              <Braces className="size-3.5" />
              {t("mcp.editJson")}
            </Button>
          )}
          {canReveal ? (
            <Button
              className="text-muted-foreground"
              size="xs"
              title={configPath}
              type="button"
              variant="ghost"
              onClick={() =>
                void desktopApi.revealPathInFileManager(configPath)
              }
            >
              <FolderOpen className="size-3.5" />
              {t("mcp.revealConfig")}
            </Button>
          ) : null}
        </div>
        {errors.map((error) => (
          <Text key={error} role="alert" size="meta" tone="destructive">
            {error}
          </Text>
        ))}
      </div>
      {isJson ? (
        <Button
          className="shrink-0"
          type="button"
          variant="outline"
          onClick={() => onModeChange("form")}
        >
          <SlidersHorizontal className="size-4" />
          {t("mcp.backToForm")}
        </Button>
      ) : null}
    </div>
  );
}
