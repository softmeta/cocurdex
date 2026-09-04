import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui";
import { editorSettingsAtom } from "@/features/editor/editor-settings";

export function EditorSettingsPanel() {
  const { t } = useTranslation("settings");
  const [editorSettings, setEditorSettings] = useAtom(editorSettingsAtom);

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <div className="flex flex-col">
        <div className="rounded-card border border-border/70 bg-card/45 px-4">
          <div className="flex flex-col divide-y divide-border/60">
            <div className="flex items-center justify-between gap-6 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-body font-medium text-foreground">
                  {t("editor.minimap.title")}
                </div>
                <div className="mt-0.5 text-body text-muted-foreground">
                  {t("editor.minimap.description")}
                </div>
              </div>
              <div className="shrink-0">
                <Switch
                  checked={editorSettings.codeMinimap}
                  onCheckedChange={(codeMinimap) =>
                    setEditorSettings({
                      ...editorSettings,
                      codeMinimap,
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
