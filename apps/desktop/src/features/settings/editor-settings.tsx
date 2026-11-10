import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { SettingRow, SettingsGroup } from "@/components/app";
import { Switch } from "@/components/ui";
import { editorSettingsAtom } from "@/features/editor/editor-settings";

export function EditorSettingsPanel() {
  const { t } = useTranslation("settings");
  const [editorSettings, setEditorSettings] = useAtom(editorSettingsAtom);

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <SettingsGroup>
        <SettingRow
          searchId="editor.minimap"
          description={t("editor.minimap.description")}
          title={t("editor.minimap.title")}
        >
          <Switch
            checked={editorSettings.codeMinimap}
            onCheckedChange={(codeMinimap) =>
              setEditorSettings({
                ...editorSettings,
                codeMinimap,
              })
            }
          />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
