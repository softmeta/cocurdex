import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Spinner, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import { SettingRow, SettingsGroup } from "./settings-fields";

export function DiagnosticsSettingsPanel() {
  const { t } = useTranslation("settings");
  const [busy, setBusy] = useState(false);
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runExport = async () => {
    setBusy(true);
    setExportedPath(null);
    setErrorMessage(null);
    try {
      const { outputPath } = await desktopApi.exportDiagnostics();
      setExportedPath(outputPath);
      await desktopApi.revealPathInFileManager(outputPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroup title={t("diagnostics.group")}>
      <SettingRow
        description={t("diagnostics.description")}
        title={t("diagnostics.title")}
      >
        <div className="flex items-center gap-2">
          {busy ? <Spinner size="md" /> : null}
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() => {
              void runExport();
            }}
          >
            {t("diagnostics.actions.export")}
          </Button>
        </div>
      </SettingRow>
      {errorMessage ? (
        <div className="py-3.5">
          <Text className="block break-all" size="meta" tone="destructive">
            {t("diagnostics.status.failed", { message: errorMessage })}
          </Text>
        </div>
      ) : exportedPath ? (
        <div className="py-3.5">
          <Text className="block break-all" size="meta" tone="muted">
            {t("diagnostics.status.exported", { path: exportedPath })}
          </Text>
        </div>
      ) : null}
    </SettingsGroup>
  );
}
