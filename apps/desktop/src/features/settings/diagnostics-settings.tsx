import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Spinner, Switch, Text } from "@/components/ui";
import { desktopApi, useMountEffect } from "@/lib";
import { SettingRow, SettingsGroup } from "./settings-fields";

export function DiagnosticsSettingsPanel() {
  const { t } = useTranslation("settings");
  const [busy, setBusy] = useState(false);
  const [verbose, setVerbose] = useState<boolean | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useMountEffect(() => {
    void desktopApi.getDiagnosticsVerbose().then(setVerbose);
  });

  const onVerboseChange = async (enabled: boolean) => {
    setVerbose(enabled);
    try {
      await desktopApi.setDiagnosticsVerbose(enabled);
    } catch {
      setVerbose(!enabled);
    }
  };

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
        description={t("diagnostics.verbose.description")}
        title={t("diagnostics.verbose.title")}
      >
        <Switch
          checked={verbose ?? false}
          disabled={verbose === null}
          onCheckedChange={(enabled) => {
            void onVerboseChange(enabled);
          }}
        />
      </SettingRow>
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
